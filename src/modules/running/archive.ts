import type { Run } from './model.ts';
export function runOutcomeLabel(run: Pick<Run, 'status' | 'courseId' | 'courseOutcome'>) {
  if (run.status !== 'completed') return run.status === 'running' ? '진행 중' : '이어달리기';
  if (!run.courseId) return '자유 러닝';
  return run.courseOutcome === 'finished' ? '코스 완주' : '중도 종료';
}
export function groupRunsByMonth(runs: Run[]) {
  const groups = new Map<string, { key: string; label: string; runs: Run[] }>();
  const seen = new Set<string>();
  for (const run of [...runs].sort((a,b) => b.startedAt-a.startedAt || b.id.localeCompare(a.id))) {
    if (seen.has(run.id)) continue; seen.add(run.id);
    const d=new Date(run.startedAt), key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!groups.has(key)) groups.set(key,{key,label:`${d.getFullYear()}년 ${d.getMonth()+1}월`,runs:[]});
    groups.get(key)!.runs.push(run);
  }
  return [...groups.values()];
}
