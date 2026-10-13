import type { CourseRepository } from '../courses/repository.ts';
import type { RunRepository } from './repository.ts';
import { RunError } from './model.ts';

export async function prepareRunRetry(repositories: {courses: CourseRepository; runs: RunRepository}, id: string, assertCurrent: () => void) {
  assertCurrent();
  const run=await repositories.runs.get(id); assertCurrent();
  if(run.status!=='completed')throw new RunError('진행 중인 러닝은 먼저 재개하거나 종료해 주세요.');
  const guide=await repositories.runs.guidance(id); assertCurrent();
  if(!guide || guide.course.snapshot.source!=='osm')throw new RunError('재도전할 도로 코스가 없는 기록이에요.');
  const active=await repositories.runs.active(); assertCurrent();
  if(active)throw new RunError('이미 진행 중인 러닝이 있어요. 먼저 재개하거나 종료해 주세요.');
  return repositories.courses.save(guide.course.snapshot,guide.course.name);
}
