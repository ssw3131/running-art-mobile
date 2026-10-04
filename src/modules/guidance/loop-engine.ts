import { GUIDANCE_LIMITS as L, type GuidanceState, type GuidanceFix, type GuidanceEvent } from './engine.ts';
import { prepareRoute, positionAt, project, turnsFor, distance, type Coordinate, type PreparedRoute } from './geometry.ts';
import type { ApproachPlan } from '../running/approach.ts';

type Phase = NonNullable<GuidanceState['phase']>;
type Hypothesis = { origin: number; direction: 1 | -1; meters: number; score: number; samples: number };
export type LoopCheckpoint = {
  version: 2; phase: Phase; origin: number | null; direction: 1 | -1 | null;
  progress: number; cursor: number; traveled: number; now: number; lastInput: number;
  last: GuidanceFix | null; current: Coordinate; weak: boolean; separation: number;
  offSince: number | null; joinSince: number | null; finishSince: number | null;
  targetM: number; navigation: ApproachPlan | null; navigationError: string | null; navigationProgress: number;
  episode: number; finished: boolean; hypotheses: Hypothesis[]; emitted: string[];
};
const copy = <T>(v:T):T => JSON.parse(JSON.stringify(v));
const mod = (n:number,length:number) => ((n%length)+length)%length;
export function loopAt(route: PreparedRoute,origin:number,direction:1|-1) {
  const points:Coordinate[]=[positionAt(route,origin)];
  const indices=route.points.slice(0,-1).map((_,i)=>i);
  const ordered=indices.map(i=>({i,delta:mod(direction*(route.cumulative[i]-origin),route.totalMeters)})).filter(p=>p.delta>0.001).sort((a,b)=>a.delta-b.delta);
  for(const {i} of ordered)points.push([...route.points[i]]);
  points.push([...points[0]]);
  return prepareRoute(points);
}
export function courseProjection(coordinates: readonly Coordinate[],position:Coordinate) {
  const route=prepareRoute(coordinates);
  let best=project(route,position,0,route.cumulative[1],0);
  for(let i=1;i<route.points.length-1;i++){
    const match=project(route,position,route.cumulative[i],route.cumulative[i+1],route.cumulative[i]);
    if(match.separation<best.separation)best=match;
  }
  return best;
}
export function assertClosed(coordinates:readonly Coordinate[]) {
  const route=prepareRoute(coordinates);
  if(distance(route.points[0],route.points.at(-1)!)>0.1)throw new Error('닫힌 순환 코스에서 사용할 수 있어요. 새 코스를 만들어 주세요.');
  return route;
}
export function createLoopGuidance(coordinates:readonly Coordinate[],saved?:LoopCheckpoint,plan?:ApproachPlan) {
  const original=assertClosed(coordinates);
  const s:LoopCheckpoint=saved?copy(saved):{version:2,phase:'approach',origin:null,direction:null,progress:0,cursor:0,traveled:0,now:0,lastInput:-1,last:null,current:[...coordinates[0]],weak:true,separation:0,offSince:null,joinSince:null,finishSince:null,targetM:plan?.targetM??0,navigation:plan?copy(plan):null,navigationError:null,navigationProgress:0,episode:0,finished:false,hypotheses:[],emitted:[]};
  if(s.version!==2||!['approach','direction','lap','return','arrived','continued'].includes(s.phase)||
    ![s.progress,s.cursor,s.traveled,s.now,s.targetM,s.navigationProgress,s.episode].every(n=>Number.isFinite(n)&&n>=0)||s.progress>original.totalMeters+0.1||s.cursor>original.totalMeters+0.1||s.targetM>original.totalMeters+0.1||
    (s.origin!==null&&(!Number.isFinite(s.origin)||s.origin<0||s.origin>original.totalMeters))||![null,1,-1].includes(s.direction)||
    !Array.isArray(s.current)||s.current.length!==2||!s.current.every(Number.isFinite)||!Array.isArray(s.hypotheses)||!Array.isArray(s.emitted))throw new Error('안내 복원 상태를 확인할 수 없어요.');
  let lap=s.origin!==null&&s.direction?loopAt(original,s.origin,s.direction):null;
  let events:GuidanceEvent[]=[];
  let trace:Coordinate[][]=[[]];
  const hypothesisRoutes=new Map<string,PreparedRoute>();
  function emit(kind:GuidanceEvent['kind'],id:string,text:string){if(s.emitted.includes(id))return;s.emitted.push(id);events.push({id,kind,text,timestamp:s.now,vibrate:kind==='off-route'});events=events.slice(-100);}
  function returnTarget(){return lap&&s.origin!==null&&s.direction?mod(s.origin+s.direction*s.cursor,original.totalMeters):s.targetM;}
  function navigationRequest(){
    if(s.phase==='approach'&&courseProjection(coordinates,s.current).separation<=L.returnMeters)return null;
    if(s.phase==='return'&&distance(s.current,positionAt(original,s.targetM))<=L.returnMeters)return null;
    return ['approach','return'].includes(s.phase)&&!s.navigation?{key:`${s.phase}:${s.episode}:${s.targetM}`,targetM:s.phase==='return'?s.targetM:undefined,position:[...s.current] as Coordinate}:null;
  }
  function setNavigation(plan:ApproachPlan|null,error:string|null=null){s.navigation=plan?copy(plan):null;s.navigationProgress=0;s.navigationError=error;if(plan)s.targetM=plan.targetM;}
  function beginReturn(){s.phase='return';s.targetM=returnTarget();s.navigation=null;s.navigationProgress=0;s.navigationError=null;s.episode++;s.joinSince=null;s.offSince=null;s.finishSince=null;emit('off-route',`off-${s.episode}`,'코스를 벗어났어요. 마지막 진행 지점으로 돌아가는 경로를 확인할게요.');}
  function directionCandidates(position:Coordinate){
    const matches:{meters:number;separation:number}[]=[];
    for(let i=0;i<original.points.length-1;i++){
      const a=original.cumulative[i],b=original.cumulative[i+1];if(b<=a)continue;
      const match=project(original,position,a,b,(a+b)/2);
      if(match.separation<=L.returnMeters)matches.push(match);
    }
    const closest=Math.min(...matches.map(m=>m.separation)),origins:number[]=[];
    for(const match of matches)if(match.separation<=closest+1&&origins.every(v=>Math.min(Math.abs(v-match.meters),original.totalMeters-Math.abs(v-match.meters))>3))origins.push(mod(match.meters,original.totalMeters));
    s.hypotheses=origins.flatMap(origin=>([1,-1] as const).map(direction=>({origin,direction,meters:0,score:0,samples:0})));
    s.phase='direction';s.origin=null;s.direction=null;s.navigation=null;s.navigationError=null;s.joinSince=null;
  }
  function nextInstruction(){
    if(s.phase==='arrived')return {direction:'arrival' as const,instruction:'코스를 완주했어요!',instructionM:0};
    if(s.phase==='continued')return {direction:'straight' as const,instruction:'완주 기록을 유지하며 계속 달리고 있어요.',instructionM:0};
    if(s.weak)return {direction:'unknown' as const,instruction:'위치 확인 중',instructionM:0};
    if(s.phase==='direction')return {direction:'unknown' as const,instruction:'원하는 방향으로 달리세요. 진행 방향을 확인하고 있어요.',instructionM:0};
    if(s.phase==='approach'||s.phase==='return'){
      if(!s.navigation)return {direction:'unknown' as const,instruction:s.navigationError??'보행 도로 경로를 확인하고 있어요.',instructionM:0};
      if(s.navigation.distanceM<0.01)return {direction:'straight' as const,instruction:'코스 위치를 확인하고 있어요.',instructionM:0};
      const r=prepareRoute(s.navigation.path),next=turnsFor(r).find(t=>t.meters>s.navigationProgress+3);
      return next?{direction:next.kind,instruction:next.label,instructionM:next.meters-s.navigationProgress}:{direction:'straight' as const,instruction:s.phase==='approach'?'코스 합류 지점으로 이동하세요.':'마지막 진행 지점으로 돌아가세요.',instructionM:Math.max(0,r.totalMeters-s.navigationProgress)};
    }
    if(s.cursor<s.progress-12)return {direction:'uturn' as const,instruction:'처음 달리던 방향으로 코스를 이어가세요.',instructionM:s.progress-s.cursor};
    const next=lap&&turnsFor(lap).find(t=>t.meters>s.cursor+3);
    return next?{direction:next.kind,instruction:next.label,instructionM:next.meters-s.cursor}:{direction:'straight' as const,instruction:'코스를 따라 달리세요.',instructionM:Math.max(0,original.totalMeters-s.cursor)};
  }
  function snapshot():GuidanceState{
    const remaining=s.navigation?Math.max(0,s.navigation.distanceM-s.navigationProgress):0;
    return {phase:s.phase,lapStart:s.origin===null?null:positionAt(original,s.origin),navigationError:s.navigationError,
      status:s.phase==='arrived'?'arrived':s.weak?'weak':s.phase==='return'?'off-route':'normal',position:[...s.current],progressM:s.progress,totalM:original.totalMeters,distanceM:s.traveled,
      remainingM:Math.max(0,original.totalMeters-s.progress),returnM:remaining,returnPath:s.navigation?copy(s.navigation.path):[],trace,separationM:s.separation,elapsedMs:s.now,events,...nextInstruction()};
  }
  function resume(){
    if(s.finished){s.phase='continued';s.weak=true;}else if(s.phase==='lap'||s.phase==='return'){s.targetM=returnTarget();s.phase='return';s.episode++;s.navigation=null;}
    else {s.phase='approach';s.navigation=null;s.hypotheses=[];s.origin=null;s.direction=null;}
    s.last=null;s.joinSince=null;s.offSince=null;s.finishSince=null;s.weak=true;return snapshot();
  }
  function tick(timestamp:number){s.now=Math.max(s.now,timestamp);if(!s.last||s.now-s.last.timestamp>L.gapMs){s.weak=true;s.joinSince=null;s.offSince=null;s.finishSince=null;}return snapshot();}
  function ingest(fix:GuidanceFix){
    if(s.phase==='arrived'||!Number.isFinite(fix.timestamp)||fix.timestamp<=s.lastInput||fix.timestamp<s.now)return snapshot();
    s.now=fix.timestamp;s.lastInput=fix.timestamp;
    if(!Array.isArray(fix.position)||fix.position.length!==2||!fix.position.every(Number.isFinite)||Math.abs(fix.position[0])>180||Math.abs(fix.position[1])>85||!Number.isFinite(fix.accuracy)||fix.accuracy<0||fix.accuracy>L.accuracy){s.weak=true;s.last=null;s.joinSince=null;s.offSince=null;s.finishSince=null;return snapshot();}
    const last=s.last,gap=!last||fix.timestamp-last.timestamp>L.gapMs,step=last?distance(last.position,fix.position):0;
    if(last&&!gap&&step/((fix.timestamp-last.timestamp)/1000)>12){s.weak=true;s.last=null;s.finishSince=null;return snapshot();}
    s.last=copy(fix);s.current=[...fix.position];s.weak=false;
    if(gap){s.joinSince=null;s.finishSince=null;s.offSince=null;if(trace.at(-1)!.length)trace.push([]);if(s.phase==='lap')beginReturn();}
    else s.traveled+=step;
    if(!trace.at(-1)!.length||step>=2){trace.at(-1)!.push([...fix.position]);if(trace.at(-1)!.length>20000)trace.at(-1)!.splice(0,1000);}
    if(s.phase==='continued')return snapshot();
    if(s.phase==='approach'||s.phase==='return'){
      const initial=s.phase==='approach';
      const matched=initial&&!s.navigation?courseProjection(coordinates,s.current):{separation:distance(s.current,positionAt(original,s.targetM)),meters:s.targetM};
      s.separation=matched.separation;
      if(matched.separation<=L.returnMeters){s.joinSince??=s.now;if(s.now-s.joinSince>=L.returnMs){
        if(initial)directionCandidates(s.current);else {s.phase='lap';s.navigation=null;s.navigationError=null;s.joinSince=null;emit('returned',`returned-${s.episode}`,'코스로 돌아왔어요. 남은 코스를 이어가세요.');}
      }}else s.joinSince=null;
      if(s.navigation){
        if(s.navigation.distanceM<0.01){s.navigation=null;return snapshot();}
        const r=prepareRoute(s.navigation.path),m=project(r,s.current,Math.max(0,s.navigationProgress-20),Math.min(r.totalMeters,s.navigationProgress+Math.max(30,step*1.5+6)),s.navigationProgress);
        if(m.separation<=L.returnMeters){s.navigationProgress=m.meters;s.offSince=null;}
        else if(m.separation>L.offMeters){s.offSince??=s.now;if(s.now-s.offSince>=L.offMs){s.navigation=null;s.navigationProgress=0;s.navigationError=null;s.episode++;s.offSince=null;}}
        if(s.navigation&&s.now>0){
          const next=turnsFor(r).find(t=>t.meters>s.navigationProgress+3);
          if(next&&next.meters-s.navigationProgress<=100){const threshold=next.meters-s.navigationProgress<=30?30:100;const id=`nav-${s.episode}-${next.id}`;if(threshold===30&&!s.emitted.includes(`${id}-100`))s.emitted.push(`${id}-100`);emit('turn',`${id}-${threshold}`,`약 ${Math.max(5,Math.round((next.meters-s.navigationProgress)/5)*5)}미터 앞에서 ${next.label}`);}
          else emit('turn',`nav-${s.episode}-start`,initial?'보행 도로를 따라 코스 합류 지점으로 이동하세요.':'보행 도로를 따라 마지막 진행 지점으로 돌아가세요.');
        }
      }
      return snapshot();
    }
    if(s.phase==='direction'){
      if(gap){directionCandidates(s.current);return snapshot();}
      const max=Math.max(15,step*1.5+6),survivors:Hypothesis[]=[];
      for(const h of s.hypotheses){const key=`${h.origin}:${h.direction}`;let r=hypothesisRoutes.get(key);if(!r){r=loopAt(original,h.origin,h.direction);hypothesisRoutes.set(key,r);}
        const m=project(r,s.current,Math.max(0,h.meters-max),h.meters+max,h.meters+step);
        if(m.separation<=L.returnMeters)survivors.push({...h,meters:m.meters,score:h.score+m.separation,samples:h.samples+1});
      }
      s.hypotheses=survivors;
      if(!survivors.length){s.phase='approach';s.navigation=null;s.joinSince=null;s.episode++;return snapshot();}
      const choices=survivors.filter(h=>h.meters>=20&&h.samples>=3&&distance(positionAt(original,h.origin),s.current)>=15).sort((a,b)=>a.score/a.samples-b.score/b.samples);
      const best=choices[0];
      const equivalent=(h:Hypothesis,b:Hypothesis)=>{
        const a=hypothesisRoutes.get(`${h.origin}:${h.direction}`)!,r=hypothesisRoutes.get(`${b.origin}:${b.direction}`)!;
        return [...a.cumulative,...r.cumulative].every(m=>distance(positionAt(a,m),positionAt(r,m))<1);
      };
      if(best && !survivors.some(h=>h!==best&&h.meters>=10&&Math.abs(h.score/h.samples-best.score/best.samples)<3&&!equivalent(h,best))){
        s.origin=best.origin;s.direction=best.direction;s.cursor=best.meters;s.progress=best.meters;s.hypotheses=[];s.phase='lap';lap=loopAt(original,best.origin,best.direction);
      }
      return snapshot();
    }
    if(!lap)return snapshot();
    const max=Math.max(15,step*1.5+6),matched=project(lap,s.current,Math.max(0,s.cursor-max),Math.min(lap.totalMeters,s.cursor+max),s.cursor+step);
    s.separation=matched.separation;
    if(matched.separation<=L.returnMeters){s.cursor=matched.meters;s.progress=Math.max(s.progress,s.cursor);s.offSince=null;}
    else if(matched.separation>L.offMeters){s.offSince??=s.now;if(s.now-s.offSince>=L.offMs)beginReturn();}else s.offSince=null;
    if(s.phase==='lap'){
      const next=turnsFor(lap).find(t=>t.meters>s.cursor+3);
      if(next&&next.meters-s.cursor<=100){const threshold=next.meters-s.cursor<=30?30:100;if(threshold===30&&!s.emitted.includes(`${next.id}-100`))s.emitted.push(`${next.id}-100`);emit('turn',`${next.id}-${threshold}`,`약 ${Math.max(5,Math.round((next.meters-s.cursor)/5)*5)}미터 앞에서 ${next.label}`);}
      const eligible=s.cursor>=lap.totalMeters-L.finishRemaining&&s.progress>=lap.totalMeters-L.finishRemaining&&distance(s.current,lap.points[0])<=L.finishRadius&&matched.separation<=L.returnMeters;
      if(eligible){s.finishSince??=s.now;if(s.now-s.finishSince>=L.finishMs){s.phase='arrived';s.finished=true;s.progress=original.totalMeters;emit('arrival','arrival','코스를 완주했어요. 완주 결과를 확인해 주세요.');}}else s.finishSince=null;
    }
    return snapshot();
  }
  return {ingest,tick,snapshot,checkpoint:()=>copy(s),resume,navigationRequest,setNavigation,route:original};
}
