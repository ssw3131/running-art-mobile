import type { SqlExecutor } from '../storage/types.ts';

type Totals = { distanceM: number; activeMs: number };
export type ActivityCheckpoint = Totals & { id: string; startedAt?: number };
export type ActivityCredit = Totals & { periodDistanceM: number };
export type ActivityPeriod = { start: number; end: number };
export type ActivityHistory = { ancestors: ActivityCheckpoint[]; inferred?: true };

export function validActivityHistory(value: unknown, run: ActivityCheckpoint): value is ActivityHistory {
  const history = value as Partial<ActivityHistory> | null;
  if (!Array.isArray(history?.ancestors) || (history.inferred !== undefined && history.inferred !== true)) return false;
  const ids = new Set([run.id]);
  let distance = 0, time = 0;
  for (const point of history.ancestors) {
    if (!point || typeof point.id !== 'string' || !/^[a-f0-9]{32}$/.test(point.id) || ids.has(point.id) ||
        (point.startedAt !== undefined && (!Number.isSafeInteger(point.startedAt) || point.startedAt < 0)) ||
        !Number.isFinite(point.distanceM) || point.distanceM < distance || point.distanceM > run.distanceM ||
        !Number.isFinite(point.activeMs) || point.activeMs < time || point.activeMs > run.activeMs) return false;
    ids.add(point.id);
    distance = point.distanceM;
    time = point.activeMs;
  }
  return true;
}

function extendHistory(parent: ActivityCheckpoint, history: ActivityHistory | null): ActivityCheckpoint[] {
  return [...(history?.ancestors ?? []), { id: parent.id, startedAt: parent.startedAt, distanceM: parent.distanceM, activeMs: parent.activeMs }];
}

export async function readActivityHistory(tx: SqlExecutor, id: string, owner: string): Promise<ActivityHistory | null> {
  const row = await tx.getFirstAsync<{ history: string | null }>(
    'SELECT h.history FROM run_activity_history h JOIN running_sessions r ON r.id=h.run_id WHERE r.id=? AND r.owner_id=?', id, owner);
  return row?.history ? JSON.parse(row.history) : null;
}

export async function writeActivityHistory(tx: SqlExecutor, id: string, history: ActivityHistory) {
  await tx.runAsync('INSERT OR REPLACE INTO run_activity_history(run_id,history) VALUES(?,?)', id, JSON.stringify(history));
}

export async function inheritActivity(tx: SqlExecutor, parent: ActivityCheckpoint, owner: string) {
  return { ancestors: extendHistory(parent, await readActivityHistory(tx, parent.id, owner)) };
}

type LegacyRow = ActivityCheckpoint & { history: string | null };

// Compare copied fixes in SQLite only at migration/restore. Simulations rebase
// timestamps onto their new start, real GPS retains the original timestamps.
export async function repairActivityHistories(tx: SqlExecutor, owner: string, courseHash: string) {
  const rows = await tx.getAllAsync<LegacyRow>(`SELECT id,distance_m AS distanceM,active_ms AS activeMs,
    started_at AS startedAt,(SELECT history FROM run_activity_history WHERE run_id=id) AS history FROM running_sessions
    WHERE owner_id=? AND course_snapshot_hash=? ORDER BY coalesce(ended_at,checkpoint_at),point_count,id`, owner, courseHash);
  const known = new Map<string, ActivityHistory>();
  for (const row of rows) {
    let history: ActivityHistory | null = row.history ? JSON.parse(row.history) : null;
    let ancestors = history?.ancestors ?? [];
    if (!history || history.inferred) {
      const candidates = await tx.getAllAsync<ActivityCheckpoint & { count: number }>(`
        SELECT p.id,p.distance_m AS distanceM,p.active_ms AS activeMs,p.started_at AS startedAt,p.point_count AS count
        FROM running_sessions c JOIN running_sessions p ON p.owner_id=c.owner_id
          AND p.course_snapshot_hash=c.course_snapshot_hash AND p.id<>c.id
        JOIN running_points last ON last.run_id=p.id AND last.sequence=p.point_count
        JOIN running_points next ON next.run_id=c.id AND next.sequence=p.point_count+1
        WHERE c.id=? AND p.status='completed' AND p.course_outcome='stopped'
          AND p.ended_at<=coalesce(c.ended_at,c.checkpoint_at) AND p.point_count>=2
          AND p.point_count<c.point_count AND p.distance_m<=c.distance_m AND p.active_ms<=c.active_ms
          AND next.segment>last.segment AND coalesce(p.reason LIKE '[시뮬레이션]%',0)=coalesce(c.reason LIKE '[시뮬레이션]%',0)
          AND (p.started_at=c.started_at OR c.reason LIKE '[시뮬레이션]%')
          AND NOT EXISTS (SELECT 1 FROM running_points a LEFT JOIN running_points b ON b.run_id=c.id AND b.sequence=a.sequence
            WHERE a.run_id=p.id AND (b.sequence IS NULL OR a.latitude<>b.latitude OR a.longitude<>b.longitude OR a.accuracy<>b.accuracy
              OR a.segment<>b.segment OR a.timestamp-p.started_at<>b.timestamp-c.started_at))
        ORDER BY p.point_count DESC LIMIT 2`, row.id);
      const parent = candidates[0];
      if (parent && parent.count !== candidates[1]?.count) {
        const inferred = extendHistory(parent, known.get(parent.id) ?? null);
        // Keep evidence carried by a surviving child when a predecessor was deleted.
        if (ancestors.every(old => inferred.some(point => point.id === old.id))) ancestors = inferred;
      } else if (parent && history?.inferred && ancestors.length) {
        // A later restore can reveal a second equally plausible parent.
        ancestors = [];
      }
    }
    // A grandparent may be restored after this child's original backup.
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const prefix = known.get(ancestors[i].id)?.ancestors;
      if (prefix && prefix.length > i && ancestors.slice(0,i).every(old => prefix.some(p => p.id === old.id))) {
        ancestors = [...prefix, ...ancestors.slice(i)];
        break;
      }
    }
    if ((ancestors.length || history?.ancestors.length) && ancestors !== history?.ancestors) {
      const updated: ActivityHistory = { ancestors, ...(!history || history.inferred ? { inferred: true as const } : {}) };
      const json = JSON.stringify(updated);
      if (json !== row.history && validActivityHistory(updated,row)) {
        await writeActivityHistory(tx, row.id, updated);
        await tx.runAsync(`UPDATE running_sessions SET dirty=1,mutation_id=lower(hex(randomblob(16)))
          WHERE id=? AND owner_id=?`, row.id,owner);
        history = updated;
      }
    }
    if (history) known.set(row.id,history);
  }
}

/** Assign each physical contribution to the first surviving completed record containing it. */
export function activityCredits<T extends ActivityCheckpoint & { startedAt: number; endedAt?: number | null; history?: ActivityHistory | null }>(records: readonly T[], period?: ActivityPeriod) {
  // A descendant can carry the only surviving copy of an intermediate
  // checkpoint. Find those edges before assigning credit, regardless of
  // restore order. A more detailed chain can refine an old inferred prefix.
  const parents = new Map<string, ActivityCheckpoint>();
  for (const record of records) {
    let previous: ActivityCheckpoint | undefined;
    for (const part of [...(record.history?.ancestors ?? []), record]) {
      const existing = parents.get(part.id);
      if (previous && (!existing || previous.distanceM > existing.distanceM || previous.activeMs > existing.activeMs)) {
        parents.set(part.id, previous);
      }
      previous = part;
    }
  }

  const seen = new Set<string>();
  const credits = new Map<string, ActivityCredit>();
  const ordered = [...records].sort((a,b) => (a.endedAt ?? a.startedAt) - (b.endedAt ?? b.startedAt) ||
    (a.history?.ancestors.length ?? 0) - (b.history?.ancestors.length ?? 0) || a.id.localeCompare(b.id));
  for (const record of ordered) {
    if (credits.has(record.id)) continue;
    let distanceM = 0, activeMs = 0, periodDistanceM = 0;
    let part: ActivityCheckpoint | undefined = record;
    while (part && !seen.has(part.id)) {
      seen.add(part.id);
      const parent: ActivityCheckpoint | undefined = parents.get(part.id);
      const distance = part.distanceM - (parent?.distanceM ?? 0);
      distanceM += distance;
      const startedAt = part.startedAt ?? record.startedAt;
      if (period && startedAt >= period.start && startedAt < period.end) periodDistanceM += distance;
      activeMs += part.activeMs - (parent?.activeMs ?? 0);
      part = parent;
    }
    credits.set(record.id, {distanceM, activeMs, periodDistanceM});
  }
  return credits;
}
