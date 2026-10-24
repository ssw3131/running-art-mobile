import type { CourseAttempt } from './model.ts';
export function courseContinuation(last: CourseAttempt|null, activeId: string|null) {
  const unfinished=!!last && !(last.status==='completed' && last.courseOutcome==='finished');
  return { unfinished, label:unfinished?'이 코스 러닝 이어하기':'이 코스 러닝 시작하기',
    action: activeId && activeId!==last?.id?'other-active':last && last.status!=='completed'?'resume':unfinished?'new-after-stop':'start' } as const;
}
