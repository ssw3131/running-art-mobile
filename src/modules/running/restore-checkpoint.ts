import { createRunGuidance, type RunCourse, type RunGuidanceCheckpoint } from './guidance.ts';
import type { Run, RunPoint } from './model.ts';

/** Cloud archives retain accepted points, but intentionally omit executable state. */
export function restoreRunCheckpoint(course:RunCourse,run:Run,points:readonly RunPoint[],raw:string|null):RunGuidanceCheckpoint {
  if(raw)return createRunGuidance(course.snapshot.route,JSON.parse(raw)).checkpoint();
  const engine=createRunGuidance(course.snapshot.route);
  let segment:number|undefined;
  for(const point of points){if(segment!==undefined&&segment!==point.segment)engine.resume();segment=point.segment;engine.ingest({position:[point.longitude,point.latitude],accuracy:point.accuracy??30,timestamp:point.timestamp-run.startedAt});}
  const checkpoint=engine.checkpoint();
  if(checkpoint.version===2&&checkpoint.finished&&run.courseOutcome!=='finished')throw new Error('저장된 러닝 진행 상태를 확인해 주세요.');
  return checkpoint;
}
