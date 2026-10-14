import type { SqlExecutor, StorageDatabase } from '../storage/types.ts';
import { StorageError } from '../storage/types.ts';
import { serialDatabase } from '../storage/serial-database.ts';
import { ownerId, type OwnerScope } from '../sync/ownership.ts';
import { columns } from '../running/repository.ts';
import { readAchievements } from '../achievements/repository.ts';
import type { Run } from '../running/model.ts';
import { guidanceColumns, readRunGuidance, type GuidanceRow } from '../running/guidance.ts';
import { courseProgress, homeMonth, type HomeActive, type HomeData, type HomePath } from './model.ts';

async function trace(tx: SqlExecutor, run: Run): Promise<HomePath[]> {
  // Bound the home preview to roughly 240 points, preserving segment boundaries.
  const step = Math.max(1, Math.ceil(run.pointCount / 240));
  const points = await tx.getAllAsync<{ segment: number; longitude: number; latitude: number }>(
    'SELECT segment,longitude,latitude FROM running_points WHERE run_id=? AND (sequence % ?=0 OR sequence=1 OR sequence=?) ORDER BY sequence', run.id, step, run.pointCount);
  const paths: HomePath[] = []; let segment = -1;
  for (const p of points) {
    if (segment !== p.segment) { paths.push([]); segment = p.segment; }
    paths.at(-1)!.push([p.longitude, p.latitude]);
  }
  return paths;
}

/** One owner-checked read transaction; no schema change or writes to user records. */
export function createHomeRepository(database: StorageDatabase, scope: OwnerScope) {
  const db = serialDatabase(database);
  return { async read(now = Date.now()): Promise<HomeData> {
    const owner = ownerId(scope()), month = homeMonth(now);
    const check = () => { if (ownerId(scope()) !== owner) throw new StorageError('validation', '계정이 변경되었어요. 홈을 다시 확인해 주세요.'); };
    let result!: HomeData;
    await db.withExclusiveTransactionAsync(async tx => {
      check();
      const summary = await tx.getFirstAsync<{ count: number; distance: number }>(
        "SELECT count(*) count,coalesce(sum(CASE WHEN started_at>=? AND started_at<? THEN distance_m ELSE 0 END),0) distance FROM running_sessions WHERE owner_id=? AND status='completed'", month.start, month.end, owner);
      const recentRuns = await tx.getAllAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE owner_id=? AND status='completed' ORDER BY started_at DESC,id DESC LIMIT 3`, owner);
      const run = await tx.getFirstAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE owner_id=? AND status!='completed' ORDER BY started_at DESC,id DESC LIMIT 1`, owner);
      let active: HomeActive | null = null;
      if (run) {
        active = { run, paths: await trace(tx, run), progress: null, totalM: null, guidanceError: false };
        if (run.courseId) {
          try {
            const row = await tx.getFirstAsync<GuidanceRow>(`SELECT ${guidanceColumns} FROM running_sessions WHERE id=? AND owner_id=?`, run.id, owner);
            const guidance = row && readRunGuidance(row);
            if (guidance) {
              const route = guidance.course.snapshot.route, step = Math.max(1, Math.ceil(route.length / 240));
              active.paths = [route.filter((_, i) => i % step === 0 || i === route.length - 1)];
              active.totalM = guidance.state.totalM;
              active.progress = courseProgress(guidance.state.progressM, guidance.state.totalM);
            }
          } catch { active.guidanceError = true; }
        }
      }
      const recent = [];
      for (const recentRun of recentRuns) recent.push({ run: recentRun, paths: await trace(tx, recentRun) });
      const achievements = await readAchievements(tx, owner, now);
      check();
      result = { owner, monthStart: month.start, monthEnd: month.end, monthlyDistanceM: summary?.distance ?? 0, runCount: summary?.count ?? 0, active, recent, currentStreak: achievements.currentStreak };
    });
    check(); return result;
  } };
}
export type HomeRepository = ReturnType<typeof createHomeRepository>;
