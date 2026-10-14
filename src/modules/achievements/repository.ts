import type { SqlExecutor, StorageDatabase } from '../storage/types.ts';
import { StorageError } from '../storage/types.ts';
import { serialDatabase } from '../storage/serial-database.ts';
import { ownerId, type OwnerScope } from '../sync/ownership.ts';
import { summarizeAchievements, type AchievementRun } from './model.ts';

export async function readAchievements(tx: SqlExecutor, owner: string, now: number) {
  // Read only small summary columns, not GPS arrays or full course snapshots.
  const rows = await tx.getAllAsync<AchievementRun>(`SELECT id,status,started_at AS startedAt,distance_m AS distanceM,active_ms AS activeMs,
    course_id AS courseId,course_outcome AS courseOutcome,
    CASE WHEN json_valid(course_snapshot_json) THEN json_extract(course_snapshot_json,'$.shape') ELSE NULL END AS shape
    FROM running_sessions WHERE owner_id=? AND status='completed' ORDER BY started_at,id`, owner);
  return summarizeAchievements(rows, now);
}

export function createAchievementsRepository(database: StorageDatabase, scope: OwnerScope) {
  const db = serialDatabase(database);
  return { async read(now = Date.now()) {
    const owner = ownerId(scope());
    const check = () => { if (ownerId(scope()) !== owner) throw new StorageError('validation', '계정이 변경되었어요. 기록을 다시 확인해 주세요.'); };
    let result!: Awaited<ReturnType<typeof readAchievements>>;
    await db.withExclusiveTransactionAsync(async tx => { check(); result = await readAchievements(tx, owner, now); check(); });
    check(); return result;
  } };
}
export type AchievementsRepository = ReturnType<typeof createAchievementsRepository>;
