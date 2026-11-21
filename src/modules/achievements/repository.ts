import type { Origin } from '../route-engine/types.ts';
import type { SqlExecutor, StorageDatabase } from '../storage/types.ts';
import { StorageError } from '../storage/types.ts';
import { serialDatabase } from '../storage/serial-database.ts';
import { ownerId, type OwnerScope } from '../sync/ownership.ts';
import { activityCredits, type ActivityHistory, type ActivityPeriod } from '../running/activity-history.ts';
import { summarizeAchievements } from './model.ts';
import { badgeProgress, type BadgeRecord } from './catalog.ts';

export async function readAchievements(tx: SqlExecutor, owner: string, now: number) {
  return summarizeAchievements(await readBadgeRecords(tx, owner), now);
}

export async function readBadgeRecords(tx:SqlExecutor,owner:string,period?:ActivityPeriod):Promise<BadgeRecord[]>{
  const rows = await tx.getAllAsync<BadgeRecord & {historyJson:string|null}>(`SELECT id,status,started_at AS startedAt,ended_at AS endedAt,
          distance_m AS distanceM,active_ms AS activeMs,(SELECT history FROM run_activity_history WHERE run_id=id) AS historyJson,course_id AS courseId,course_outcome AS courseOutcome,course_name AS courseName,reason,
          CASE WHEN json_valid(course_snapshot_json) THEN json_extract(course_snapshot_json,'$.shape') ELSE NULL END AS shape,
          CASE WHEN json_valid(course_snapshot_json) THEN json_extract(course_snapshot_json,'$.targetKm') ELSE NULL END AS targetKm,
          CASE WHEN json_valid(course_snapshot_json) THEN json_extract(course_snapshot_json,'$.origin.lat') ELSE NULL END AS originLat,
          CASE WHEN json_valid(course_snapshot_json) THEN json_extract(course_snapshot_json,'$.origin.lng') ELSE NULL END AS originLng,
          course_snapshot_hash AS courseHash,(SELECT region FROM achievement_regions WHERE run_id=running_sessions.id AND owner_id=running_sessions.owner_id) AS region
          FROM running_sessions WHERE owner_id=? AND status='completed' ORDER BY started_at,id`,owner);
  const records = rows.map(({historyJson,...row}) => ({...row, history: historyJson ? JSON.parse(historyJson) as ActivityHistory : null}));
  const credits = activityCredits(records, period);
  return records.map(({history: _history,...row}) => ({...row, credited: credits.get(row.id)}));
}

export function createAchievementsRepository(database: StorageDatabase, scope: OwnerScope) {
  const db = serialDatabase(database);
  return {
    async gallery(){
      const owner=ownerId(scope());let records:BadgeRecord[]=[];
      await db.withExclusiveTransactionAsync(async tx=>{
        if(ownerId(scope())!==owner)throw new StorageError('validation','계정이 변경되었어요.');
        records=await readBadgeRecords(tx,owner);
        if(ownerId(scope())!==owner)throw new StorageError('validation','계정이 변경되었어요.');
      });
      if(ownerId(scope())!==owner)throw new StorageError('validation','계정이 변경되었어요.');
      return {records,badges:badgeProgress(records),summary:summarizeAchievements(records)};
    },
    async resolveRegions(resolve:(origin:Origin,signal:AbortSignal)=>Promise<string|null>,signal:AbortSignal){
      const owner=ownerId(scope());
      const rows=await db.getAllAsync<{id:string;lat:number;lng:number}>(`SELECT id,json_extract(course_snapshot_json,'$.origin.lat') AS lat,json_extract(course_snapshot_json,'$.origin.lng') AS lng
        FROM running_sessions WHERE owner_id=? AND status='completed' AND course_outcome='finished' AND json_valid(course_snapshot_json)
        AND NOT EXISTS(SELECT 1 FROM achievement_regions WHERE run_id=running_sessions.id AND owner_id=?) ORDER BY started_at DESC LIMIT 30`,owner,owner);
      for(const row of rows){if(signal.aborted||ownerId(scope())!==owner)return;const region=await resolve({lat:row.lat,lng:row.lng},signal);if(!region||signal.aborted||ownerId(scope())!==owner)continue;
        await db.withExclusiveTransactionAsync(async tx=>{if(ownerId(scope())!==owner||signal.aborted)return;await tx.runAsync(`INSERT OR REPLACE INTO achievement_regions(run_id,owner_id,region) SELECT id,owner_id,? FROM running_sessions WHERE id=? AND owner_id=? AND status='completed' AND course_outcome='finished'`,region,row.id,owner);});
      }
    }, async read(now = Date.now()) {
    const owner = ownerId(scope());
    const check = () => { if (ownerId(scope()) !== owner) throw new StorageError('validation', '계정이 변경되었어요. 기록을 다시 확인해 주세요.'); };
    let result!: Awaited<ReturnType<typeof readAchievements>>;
    await db.withExclusiveTransactionAsync(async tx => { check(); result = await readAchievements(tx, owner, now); check(); });
    check(); return result;
  } };
}
export type AchievementsRepository = ReturnType<typeof createAchievementsRepository>;
