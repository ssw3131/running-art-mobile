import type { SqlExecutor, StorageDatabase } from '../storage/types.ts';
import { StorageError } from '../storage/types.ts';
import { serialDatabase } from '../storage/serial-database.ts';
import { ownerId, type OwnerScope } from '../sync/ownership.ts';
import { columns } from '../running/repository.ts';
import { readBadgeRecords } from '../achievements/repository.ts';
import { summarizeAchievements } from '../achievements/model.ts';
import { badgeProgress } from '../achievements/catalog.ts';
import { savedCourseOrderSql } from '../courses/ordering.ts';
import type { Run } from '../running/model.ts';
import { decodeSnapshot, type CourseSummary } from '../courses/model.ts';
import { homeMonth, type HomeData, type HomePath, type HomeCourse } from './model.ts';

async function trace(tx: SqlExecutor, run: Run): Promise<HomePath[]> {
  const step = Math.max(1, Math.ceil(run.pointCount / 240));
  // Retain both ends of every GPS segment, including short interrupted segments.
  const points = await tx.getAllAsync<{ segment: number; longitude: number; latitude: number }>(
    `SELECT segment,longitude,latitude FROM running_points WHERE run_id=? AND
     (sequence % ?=0 OR sequence IN (SELECT min(sequence) FROM running_points WHERE run_id=? GROUP BY segment)
       OR sequence IN (SELECT max(sequence) FROM running_points WHERE run_id=? GROUP BY segment)) ORDER BY sequence`,
    run.id, step, run.id, run.id);
  const paths: HomePath[] = []; let segment = -1;
  for (const p of points) {
    if (segment !== p.segment) { paths.push([]); segment = p.segment; }
    paths.at(-1)!.push([p.longitude, p.latitude]);
  }
  return paths;
}

/** One owner-checked read transaction. Never changes or adopts existing records. */
export function createHomeRepository(database: StorageDatabase, scope: OwnerScope) {
  const db = serialDatabase(database);
  return { async read(now = Date.now()): Promise<HomeData> {
    const owner = ownerId(scope()), month = homeMonth(now);
    const check = () => { if (ownerId(scope()) !== owner) throw new StorageError('validation', '계정이 변경되었어요. 홈을 다시 확인해 주세요.'); };
    let result!: HomeData;
    await db.withExclusiveTransactionAsync(async tx => {
      check();
      const summary = await tx.getFirstAsync<{ count: number; distance: number }>(
        `SELECT count(*) count,coalesce(sum(CASE WHEN status='completed' AND started_at>=? AND started_at<? THEN distance_m ELSE 0 END),0) distance
         FROM running_sessions WHERE owner_id=?`, month.start, month.end, owner);
      const latestCompleted = await tx.getFirstAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE owner_id=? AND status='completed' ORDER BY started_at DESC,id DESC LIMIT 1`, owner);
      const recentRuns = await tx.getAllAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE owner_id=?
        ORDER BY CASE WHEN status='completed' THEN 1 ELSE 0 END,started_at DESC,id DESC LIMIT 3`, owner);
      const recent = [];
      for (const run of recentRuns) recent.push({ run, paths: await trace(tx, run) });
      const count = await tx.getFirstAsync<{ n: number }>('SELECT count(*) n FROM saved_courses WHERE owner_id=?', owner);
      const rows = await tx.getAllAsync<CourseSummary & { json: string; hash: string }>(`SELECT id,name,source,shape,target_km AS targetKm,length_km AS lengthKm,score,
        created_at AS createdAt,updated_at AS updatedAt,snapshot_json AS json,snapshot_hash AS hash FROM saved_courses c
        WHERE owner_id=? ORDER BY ${savedCourseOrderSql} LIMIT 3`, owner);
      const courses: HomeCourse[] = [];
      for(const {json,hash,...summary} of rows){
        const last=await tx.getFirstAsync<{status:string;outcome:string}>(`SELECT status,course_outcome AS outcome FROM running_sessions WHERE owner_id=? AND (course_id=? OR course_snapshot_hash=?) ORDER BY (status!='completed') DESC,coalesce(ended_at,started_at) DESC,started_at DESC,id DESC LIMIT 1`,owner,summary.id,hash);
        const course={...summary,unfinished:!!last&&!(last.status==='completed'&&last.outcome==='finished'),inProgress:!!last&&last.status!=='completed'};
        try {
          const route = decodeSnapshot(json, hash).route, step = Math.max(1, Math.ceil(route.length / 240));
          courses.push({ course, paths: [route.filter((_, i) => i % step === 0 || i === route.length - 1)], previewError: false });
        } catch { courses.push({ course, paths: [], previewError: true }); }
      }
      const completedRuns=await tx.getAllAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE owner_id=? AND status='completed' AND course_outcome='finished' AND course_id IS NOT NULL ORDER BY started_at DESC,id DESC LIMIT 3`,owner);
      const completed=[];for(const run of completedRuns)completed.push({run,paths:await trace(tx,run)});
      const records=await readBadgeRecords(tx,owner),achievements=summarizeAchievements(records,now),badges=badgeProgress(records);
      check();
      result = { owner, monthStart: month.start, monthEnd: month.end, monthlyDistanceM: summary?.distance ?? 0,
        runCount: summary?.count ?? 0, recent, latestCompleted, courseCount: count?.n ?? 0, courses, currentStreak: achievements.currentStreak,badges,completed };
    });
    check(); return result;
  } };
}
export type HomeRepository = ReturnType<typeof createHomeRepository>;
