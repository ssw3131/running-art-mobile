import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Graph, Steps, Origin, RoadSegmentRef } from '../route-engine/types.ts';
import { WalkingError } from '../route-engine/walking.ts';
import type { RoadLoader } from '../road-data/client.ts';
import { distance, prepareRoute, positionAt, project, type Coordinate } from '../guidance/geometry.ts';
import type { ApproachPlan, ApproachRequest } from './approach.ts';
import type * as engine from '../route-engine/engine.ts';
import type * as walking from '../route-engine/walking.ts';

type Operations=Pick<typeof import('./approach.ts'),'approachSteps'|'validApproach'>&Pick<typeof engine,'buildGraphSteps'|'toPoint'>&Pick<typeof walking,'snapWalkingSourceSteps'>;
type GraphEntry={graph:Graph;origin:Origin;radius:number;version:string;at:number};
type PlanEntry={key:string;plan:ApproachPlan;position:Coordinate;source:RoadSegmentRef;version:string;at:number;graph?:Graph};
export type ApproachTiming={roadMs:number;graphMs:number;searchMs:number;totalMs:number;cache:'plan'|'graph'|'none';radius:number};
const TTL=300000,MAX_SIZE=100000;
const courseKey=(r:ApproachRequest)=>bytesToHex(sha256(utf8ToBytes(JSON.stringify([r.course.route,r.course.roadSegments,r.targetM??null]))));
const sameRoad=(a:RoadSegmentRef,b:RoadSegmentRef)=>a.way===b.way&&a.from===b.from&&a.to===b.to;
export function createApproachCache(load:RoadLoader,op:Operations,yieldToHost:()=>Promise<void>,now=()=>Date.now()){
  let graphs:GraphEntry[]=[],plans:PlanEntry[]=[],generation=0;
  const pending=new Map<string,{controller:AbortController;promise:Promise<ApproachPlan>;users:number;release?:ReturnType<typeof setTimeout>}>();
  const versions=new Map<string,string>();
  const region=(o:Origin)=>`${Math.floor(o.lat)},${Math.floor(o.lng)}`;
  const clear=()=>{generation++;graphs=[];plans=[];versions.clear();for(const job of pending.values()){clearTimeout(job.release);job.controller.abort();}pending.clear();};
  let roadRevision=0;
  const roadsChanged=()=>{roadRevision++;graphs=[];plans=[];versions.clear();};
  const prune=()=>{graphs=graphs.filter(g=>now()-g.at<TTL);plans=plans.filter(p=>now()-p.at<TTL&&(!p.graph||graphs.some(g=>g.graph===p.graph))).slice(-10);};
  async function drain<T>(steps:Steps<T>,signal:AbortSignal){let since=performance.now();try{while(true){if(signal.aborted)throw new Error('합류 경로 준비를 취소했어요.');const r=steps.next();if(r.done)return r.value;if(performance.now()-since>=8){await yieldToHost();since=performance.now();}}}finally{steps.return(undefined as never);}}
  async function calculate(request:ApproachRequest,signal:AbortSignal,report?:(t:ApproachTiming)=>void){
    prune();let revision=roadRevision;const started=performance.now(),key=courseKey(request),origin={lat:request.position[1],lng:request.position[0]};
    const timing:ApproachTiming={roadMs:0,graphMs:0,searchMs:0,totalMs:0,cache:'none',radius:0};
    const finish=(plan:ApproachPlan)=>{if(revision!==roadRevision)throw new Error('도로 자료가 갱신됐어요. 경로를 다시 확인해 주세요.');if(signal.aborted)throw new Error('합류 경로 준비를 취소했어요.');timing.totalMs=performance.now()-started;report?.(timing);return op.validApproach(plan,request.course,request.position);};
    for(const cached of [...plans].reverse()){
      if(cached.key!==key||distance(cached.position,request.position)>30)continue;
      // A remotely seeded plan is only reusable at its measured position. Any
      // movement needs a graph to distinguish parallel roads and overpasses.
      if(cached.graph){const s=await drain(op.snapWalkingSourceSteps(cached.graph,op.toPoint(origin.lat,origin.lng,cached.graph.origin),request.accuracy),signal);const ref=cached.graph.edges[s.edge].ref;if(!ref||!sameRoad(cached.source,ref))continue;}
      else if(distance(cached.position,request.position)>1)continue;
      timing.cache='plan';return finish(cached.plan);
    }
    const route=prepareRoute(request.course.route),nearest=request.targetM===undefined?project(route,request.position,0,route.totalMeters,0).separation:distance(request.position,positionAt(route,request.targetM));
    const radii=[1000,2000,5000,10000].filter(r=>r>=nearest+30||r===10000);
    let failure:unknown;const attempted=new Set<Graph>();
    for(const radius of radii){
      timing.radius=radius;let entry=graphs.find(g=>!attempted.has(g.graph)&&g.radius-distance([g.origin.lng,g.origin.lat],request.position)>=Math.min(radius,nearest+30));
      if(entry)timing.cache='graph';
      if(!entry){
        let at=performance.now();const roads=await load(origin,radius,signal,'prefer-cache');revision=roadRevision;timing.roadMs+=performance.now()-at;
        const version=roads.cache?.manifestHash??'unversioned',area=region(origin),old=versions.get(area);
        if(old&&old!==version){graphs=graphs.filter(g=>region(g.origin)!==area);plans=plans.filter(p=>p.version===version);}versions.set(area,version);
        at=performance.now();const graph=await drain(op.buildGraphSteps(roads.elements,origin,radius),signal);timing.graphMs+=performance.now()-at;
        entry={graph,origin,radius,version,at:now()};
        if(revision===roadRevision&&graph.nodes.length+graph.edges.length<=MAX_SIZE){graphs.push(entry);while(graphs.length>2||graphs.reduce((n,g)=>n+g.graph.nodes.length+g.graph.edges.length,0)>MAX_SIZE)graphs.shift();prune();}
      }
      attempted.add(entry.graph);
      try{
        const at=performance.now(),plan=await drain(op.approachSteps(entry.graph,request),signal);timing.searchMs+=performance.now()-at;
        const remaining=entry.radius-distance([entry.origin.lng,entry.origin.lat],request.position);
        // Any route leaving this circle must first cover at least `remaining`
        // from the GPS fix. Account for the verified source snap, not a fixed
        // 100m margin that needlessly rebuilds a 950m route in a 2km graph.
        const sourceSeparation=distance(request.position,plan.path[0]);
        if(plan.distanceM+sourceSeparation<remaining-1||radius===10000){
          const source=await drain(op.snapWalkingSourceSteps(entry.graph,op.toPoint(origin.lat,origin.lng,entry.graph.origin),request.accuracy),signal),ref=entry.graph.edges[source.edge].ref;
          if(revision!==roadRevision)throw new Error('도로 자료가 갱신됐어요. 경로를 다시 확인해 주세요.');
          if(ref)plans.push({key,plan,position:request.position,source:ref,version:entry.version,at:now(),graph:entry.graph});
          prune();return finish(plan);
        }
      }catch(error){if(signal.aborted||error instanceof WalkingError)throw error;failure=error;}
    }
    throw failure??new Error('반경 10km 안에서 합류 경로를 찾지 못했어요.');
  }
  const planner=(request:ApproachRequest,signal:AbortSignal,report?:(t:ApproachTiming)=>void):Promise<ApproachPlan>=>{
    if(signal.aborted)return Promise.reject(new Error('합류 경로 준비를 취소했어요.'));
    const id=JSON.stringify([courseKey(request),request.position,request.accuracy]),ticket=generation;
    let job=pending.get(id);
    if(!job){const controller=new AbortController();job={controller,users:0,promise:calculate(request,controller.signal,report)};pending.set(id,job);const current=job;void job.promise.finally(()=>{clearTimeout(current.release);if(pending.get(id)===current)pending.delete(id);}).catch(()=>{});}
    const current=job;clearTimeout(current.release);current.users++;
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(error:unknown,value?:ApproachPlan)=>{if(done)return;done=true;signal.removeEventListener('abort',abort);current.users--;if(!current.users&&pending.get(id)===current){
        const release=()=>{if(!current.users&&pending.get(id)===current){current.controller.abort();pending.delete(id);}};
        // Screen navigation gets one second to attach the next subscriber.
        // Explicit cancellation and timeouts still abort immediately.
        if(signal.reason==='handoff')current.release=setTimeout(release,1000);else release();
      }if(error)reject(error);else resolve(value!);};
      const abort=()=>finish(new Error('합류 경로 준비를 취소했어요.'));signal.addEventListener('abort',abort,{once:true});
      current.promise.then(value=>ticket===generation?finish(null,value):abort(),error=>finish(error));
    });
  };
  return Object.assign(planner,{clear,roadsChanged,seed(request:ApproachRequest,plan:ApproachPlan,source:RoadSegmentRef,version:string){
    const valid=op.validApproach(plan,request.course,request.position),area=region({lat:request.position[1],lng:request.position[0]});
    if(versions.has(area)&&versions.get(area)!==version){graphs=graphs.filter(g=>region(g.origin)!==area);plans=plans.filter(p=>p.version===version);}versions.set(area,version);
    prune();plans.push({key:courseKey(request),plan:valid,position:request.position,source,version,at:now()});prune();
  },stats:()=>({graphs:graphs.length,plans:plans.length,pending:pending.size})});
}
