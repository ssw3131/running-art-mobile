import { buildGraphSteps, toPoint, toLatLng } from '../route-engine/engine.ts';
import type { Graph, Point, RoadSegmentRef, Steps } from '../route-engine/types.ts';
import type { CourseSnapshot } from '../courses/model.ts';
import type { RoadLoader } from '../road-data/client.ts';
import { distance, prepareRoute, positionAt, type Coordinate } from '../guidance/geometry.ts';

export type ApproachPlan = { path: Coordinate[]; targetM: number; distanceM: number };
export type ApproachRequest = { course: CourseSnapshot; position: Coordinate; accuracy: number; targetM?: number };
export type ApproachPlanner = (request: ApproachRequest, signal: AbortSignal) => Promise<ApproachPlan>;
export class ApproachError extends Error {}
const projectPoint = (p: Point, a: Point, b: Point) => {
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
  return {t,point:{x:a.x+t*dx,y:a.y+t*dy},distance:Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)};
};
const sameRef = (a: RoadSegmentRef,b: RoadSegmentRef) => a.way===b.way && a.from===b.from && a.to===b.to;
const key = (r: RoadSegmentRef) => `${r.way}/${r.from}/${r.to}`;
class Heap {
  a: {id:number;cost:number}[]=[];
  push(value: {id:number;cost:number}) { let i=this.a.length;this.a.push(value);while(i){const p=(i-1)>>1;if(this.a[p].cost<=value.cost)break;this.a[i]=this.a[p];i=p;}this.a[i]=value; }
  pop() { const top=this.a[0],last=this.a.pop()!;if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1].cost<this.a[c].cost)c++;if(this.a[c].cost>=last.cost)break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return top; }
}
// The graph retains OSM topology. Only a point on a verified course edge is a
// destination; proximity at a bridge or an unrelated parallel road is not a join.
export function* approachSteps(graph: Graph,request: ApproachRequest): Steps<ApproachPlan> {
  const {course,position,accuracy,targetM}=request,route=prepareRoute(course.route);
  const p=toPoint(position[1],position[0],graph.origin);
  const targets=new Map<number,{t:number;m:number}[]>(),refs=new Map<string,number[]>();
  for(let i=0;i<course.route.length-1;i++) {
    if(i%256===0)yield;
    const r=course.roadSegments?.[i];if(r){const k=key(r);const list=refs.get(k)??[];list.push(i);refs.set(k,list);}
  }
  const fixed=targetM===undefined?null:positionAt(route,targetM);
  let source: {edge:number;t:number;separation:number}|null=null;
  let ambiguousSource=false;
  const local=course.route.map(c=>toPoint(c[1],c[0],graph.origin));
  const legacyCells=new Map<string,number[]>();
  if(!course.roadSegments)for(let i=0;i<local.length-1;i++){
    if(i%128===0)yield;const a=local[i],b=local[i+1];
    for(let x=Math.floor((Math.min(a.x,b.x)-1)/100);x<=Math.floor((Math.max(a.x,b.x)+1)/100);x++)for(let y=Math.floor((Math.min(a.y,b.y)-1)/100);y<=Math.floor((Math.max(a.y,b.y)+1)/100);y++){
      const k=`${x},${y}`,list=legacyCells.get(k)??[];list.push(i);legacyCells.set(k,list);
    }
  }
  for(let e=0;e<graph.edges.length;e++) {
    if(e%32===0)yield;
    const edge=graph.edges[e],a=graph.nodes[edge.a],b=graph.nodes[edge.b],snap=projectPoint(p,a,b);
    if(snap.distance<=Math.max(12,accuracy) && (!source||snap.distance<source.separation-1)) {source={edge:e,t:snap.t,separation:snap.distance};ambiguousSource=false;}
    else if(source && Math.abs(snap.distance-source.separation)<=1) {
      const old=graph.edges[source.edge];
      if(![old.a,old.b].includes(edge.a)&&![old.a,old.b].includes(edge.b)&&snap.t>0.02&&snap.t<0.98)ambiguousSource=true;
    }
    const legacyIndices=new Set<number>();
    if(!course.roadSegments)for(let x=Math.floor(Math.min(a.x,b.x)/100);x<=Math.floor(Math.max(a.x,b.x)/100);x++)for(let y=Math.floor(Math.min(a.y,b.y)/100);y<=Math.floor(Math.max(a.y,b.y)/100);y++)for(const i of legacyCells.get(`${x},${y}`)??[])legacyIndices.add(i);
    const indices=edge.ref&&course.roadSegments?refs.get(key(edge.ref))??[]:legacyIndices;
    const list: {t:number;m:number}[]=[];
    for(const i of indices) {
      if(i%256===0)yield;
      const ref=course.roadSegments?.[i];
      if(ref&&(!edge.ref||!sameRef(ref,edge.ref)))continue;
      const ca=local[i],cb=local[i+1],pa=projectPoint(a,ca,cb),pb=projectPoint(b,ca,cb);
      // Require collinearity with the actual saved segment, including partial
      // subdivision overlap; never snap the course to a nearby street.
      const qa=projectPoint(ca,a,b),qb=projectPoint(cb,a,b);
      const cross=Math.abs((cb.x-ca.x)*(b.y-a.y)-(cb.y-ca.y)*(b.x-a.x));
      if(cross>Math.max(1,Math.hypot(cb.x-ca.x,cb.y-ca.y)*edge.length)*0.015)continue;
      if(Math.min(pa.distance,pb.distance,qa.distance,qb.distance)>1)continue;
      const lo=Math.max(0,Math.min(qa.t,qb.t)),hi=Math.min(1,Math.max(qa.t,qb.t));
      if(hi-lo<0.000001 && pa.distance>1&&pb.distance>1)continue;
      const values=fixed?[projectPoint(toPoint(fixed[1],fixed[0],graph.origin),a,b)]:[lo,hi].map(t=>({t,distance:0}));
      for(const v of values) {
        if(v.distance>1||v.t<lo-1e-6||v.t>hi+1e-6)continue;
        const q={x:a.x+(b.x-a.x)*v.t,y:a.y+(b.y-a.y)*v.t};
        const onCourse=projectPoint(q,ca,cb);
        if(onCourse.distance>1)continue;
        const m=route.cumulative[i]+onCourse.t*(route.cumulative[i+1]-route.cumulative[i]);
        if(targetM!==undefined && Math.abs(m-targetM)>1)continue;
        list.push({t:v.t,m:targetM??m});
      }
      // If the runner is already on this edge, allow entering at the projection
      // itself, instead of needlessly routing to either endpoint.
      if(!fixed&&snap.t>=lo&&snap.t<=hi) {
        const onCourse=projectPoint(snap.point,ca,cb);
        if(onCourse.distance<=1)list.push({t:snap.t,m:route.cumulative[i]+onCourse.t*(route.cumulative[i+1]-route.cumulative[i])});
      }
    }
    if(list.length)targets.set(e,list);
  }
  if(!source||ambiguousSource)throw new ApproachError(ambiguousSource?'현재 도로가 겹쳐 위치를 구분하기 어려워요. 조금 이동한 뒤 다시 확인해 주세요.':'보행 도로 위에서 현재 위치를 다시 확인해 주세요.');
  if(!targets.size)throw new ApproachError('조회 범위에서 코스와 연결되는 도로를 확인하지 못했어요. 코스 근처로 이동하거나 도로 자료를 다시 받아 주세요.');
  const costs=new Float64Array(graph.nodes.length).fill(Infinity),previous=new Int32Array(graph.nodes.length).fill(-1),heap=new Heap();
  const se=graph.edges[source.edge],sourcePoint={x:graph.nodes[se.a].x+(graph.nodes[se.b].x-graph.nodes[se.a].x)*source.t,y:graph.nodes[se.a].y+(graph.nodes[se.b].y-graph.nodes[se.a].y)*source.t};
  const forward=graph.nodes[se.a].links.some(l=>l.id===source!.edge&&l.to===se.b),backward=graph.nodes[se.b].links.some(l=>l.id===source!.edge&&l.to===se.a);
  const seed=(id:number,cost:number)=>{costs[id]=cost;heap.push({id,cost});};
  if(backward||source.t===0)seed(se.a,se.length*source.t);
  if(forward||source.t===1)seed(se.b,se.length*(1-source.t));
  let best: {cost:number;node:number;edge:number;t:number;m:number}|null=null;
  for(const target of targets.get(source.edge)??[])if(target.t===source.t||(target.t>source.t?forward:backward))best=!best||Math.abs(target.t-source.t)*se.length<best.cost?{cost:Math.abs(target.t-source.t)*se.length,node:-1,edge:source.edge,...target}:best;
  let visited=0;
  // Single-source Dijkstra with terminal costs to every course-edge occurrence.
  const terminal=new Map<number,{edge:number;t:number;m:number;cost:number}[]>();
  for(const [id,list] of targets){const e=graph.edges[id];for(const t of list){
    for(const [node,cost,allowed] of [[e.a,t.t*e.length,graph.nodes[e.a].links.some(l=>l.id===id)], [e.b,(1-t.t)*e.length,graph.nodes[e.b].links.some(l=>l.id===id)]] as [number,number,boolean][]){
      if(!allowed&&cost!==0)continue;const a=terminal.get(node)??[];a.push({edge:id,...t,cost});terminal.set(node,a);
    }
  }}
  while(heap.a.length){if(visited++%128===0)yield;const {id,cost}=heap.pop();if(cost!==costs[id])continue;if(best&&cost>best.cost)break;
    for(const t of terminal.get(id)??[])if(!best||cost+t.cost<best.cost)best={cost:cost+t.cost,node:id,edge:t.edge,t:t.t,m:t.m};
    for(const link of graph.nodes[id].links){const next=cost+link.length;if(next<costs[link.to]){costs[link.to]=next;previous[link.to]=id;heap.push({id:link.to,cost:next});}}
  }
  if(!best)throw new ApproachError('이 범위의 보행 도로로 코스에 연결할 수 없어요. 코스 근처로 이동해 주세요.');
  const chain:Point[]=[];for(let id=best.node;id>=0;id=previous[id])chain.push(graph.nodes[id]);chain.reverse();
  const end=graph.edges[best.edge],a=graph.nodes[end.a],b=graph.nodes[end.b];
  const points=[sourcePoint,...chain,{x:a.x+(b.x-a.x)*best.t,y:a.y+(b.y-a.y)*best.t}];
  const path=points.filter((v,i)=>!i||Math.hypot(v.x-points[i-1].x,v.y-points[i-1].y)>0.01).map(v=>{const [lat,lng]=toLatLng(v,graph.origin);return [lng,lat] as Coordinate;});
  if(path.length===1)path.push([...path[0]]);
  return {path,targetM:best.m,distanceM:best.cost};
}
export function createApproachPlanner(load: RoadLoader,yieldToHost=()=>new Promise<void>(resolve=>setTimeout(resolve,0))): ApproachPlanner {
  return async (request,signal)=>{
    const check=()=>{if(signal.aborted)throw new ApproachError('합류 경로 준비를 취소했어요.');};
    async function drain<T>(steps:Steps<T>){let since=performance.now();try{while(true){check();const r=steps.next();if(r.done)return r.value;if(performance.now()-since>=8){await yieldToHost();since=performance.now();}}}finally{steps.return(undefined as never);}}
    let failure:unknown;
    for(const radius of [2000,5000,10000]){
      check();const origin={lat:request.position[1],lng:request.position[0]};
      try {
        const roads=await load(origin,radius,signal,'prefer-cache');
        const graph=await drain(buildGraphSteps(roads.elements,origin,radius));
        const result=await drain(approachSteps(graph,request));
        // An outside detour cannot beat a route shorter than the loaded radius.
        if(result.distanceM<radius-100 || radius===10000)return result;
      }catch(error){check();failure=error;if(!(error instanceof ApproachError))throw error;}
    }
    throw failure??new ApproachError('반경 10km 안에서 합류 경로를 찾지 못했어요. 코스 근처로 이동해 주세요.');
  };
}

export function validApproach(plan: ApproachPlan,course: CourseSnapshot,position?:Coordinate) {
  const route=prepareRoute(course.route);
  if(!plan||!Array.isArray(plan.path)||plan.path.length<2||plan.path.length>20000||!Number.isFinite(plan.targetM)||plan.targetM<0||plan.targetM>route.totalMeters||!Number.isFinite(plan.distanceM)||plan.distanceM<0||
    plan.path.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>85)||distance(plan.path.at(-1)!,positionAt(route,plan.targetM))>2||
    (position&&distance(position,plan.path[0])>30))throw new ApproachError('현재 위치의 합류 경로를 다시 준비해 주세요.');
  return JSON.parse(JSON.stringify(plan)) as ApproachPlan;
}
