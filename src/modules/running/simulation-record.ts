import { createRunGuidance, type RunCourse, type RunGuidanceCheckpoint } from './guidance.ts';
import { classifyFix, validateId, type Run, type RunPoint } from './model.ts';
import type { GuidanceFix } from '../guidance/engine.ts';
export const SIMULATION_REASON='[시뮬레이션] 가상 위치와 가상 러닝 시간으로 재생한 기록입니다.';
export const isSimulationRun=(run:{reason?:string|null})=>run.reason?.startsWith('[시뮬레이션]')??false;
/** Recompute completion and distance; never accept a caller-supplied finished flag. */
export function buildSimulationRecord(id:string,course:RunCourse,fixes:readonly GuidanceFix[],elapsed:number,endedAt:number,continuation?:{run:Run;points:RunPoint[];checkpoint:RunGuidanceCheckpoint}){
  validateId(id);
  if(!Number.isSafeInteger(elapsed)||elapsed<0||elapsed>86400000||!Number.isSafeInteger(endedAt)||endedAt<elapsed||fixes.length>100000)throw new Error('시뮬레이션 기록을 확인할 수 없어요.');
  const startedAt=endedAt-elapsed,engine=createRunGuidance(course.snapshot.route,continuation?.checkpoint),points:RunPoint[]=continuation?continuation.points.map(p=>({...p,timestamp:p.timestamp-continuation.run.startedAt+startedAt})):[];
  const run:Run={id,status:'completed',startedAt,endedAt,activeMs:elapsed,checkpointAt:endedAt,resumedAt:startedAt,distanceM:0,pointCount:0,rejectedCount:0,lastTimestamp:0,segment:0,breakPending:0,reason:SIMULATION_REASON,courseId:course.id,courseName:course.name,courseOutcome:'stopped'};
  if(continuation){
    if(elapsed<continuation.run.activeMs)throw new Error('이전 러닝 시간보다 짧게 저장할 수 없어요.');
    engine.resume();run.distanceM=continuation.run.distanceM;run.pointCount=points.length;run.segment=continuation.run.segment;run.breakPending=1;run.rejectedCount=continuation.run.rejectedCount;
    run.lastTimestamp=continuation.run.lastTimestamp-continuation.run.startedAt+startedAt;
  }
  let previous=-1;
  for(const value of fixes){
    if(!Number.isSafeInteger(value.timestamp)||value.timestamp<=previous||value.timestamp>elapsed||value.position.length!==2||!value.position.every(Number.isFinite)||Math.abs(value.position[0])>180||Math.abs(value.position[1])>85||!Number.isFinite(value.accuracy)||value.accuracy<0||value.accuracy>1000)throw new Error('시뮬레이션 위치를 확인할 수 없어요.');
    previous=value.timestamp;
    if(continuation&&value.timestamp<=continuation.run.activeMs)continue;
    engine.ingest(value);
    const fix={timestamp:startedAt+value.timestamp,latitude:value.position[1],longitude:value.position[0],accuracy:value.accuracy};
    const classified=classifyFix(run,points.at(-1)??null,fix,fix.timestamp);run.lastTimestamp=fix.timestamp;
    if(classified.kind==='reject'){run.rejectedCount++;run.breakPending=1;continue;}
    if(classified.kind!=='point')continue;
    if(points.length>=100000)throw new Error('한 러닝의 기록 한도에 도달했어요.');
    run.distanceM+=classified.distance;run.segment=classified.segment;run.pointCount++;run.breakPending=0;
    points.push({...fix,sequence:run.pointCount,segment:run.segment});
  }
  if(engine.snapshot().status==='arrived')run.courseOutcome='finished';
  run.breakPending=1;
  return {run,points,checkpoint:engine.checkpoint()};
}
