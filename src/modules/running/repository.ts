import type { SqlExecutor, StorageDatabase } from '../storage/types.ts';
import { classifyFix, elapsedMs, RunError, validateId, type Fix, type Run, type RunPoint, type RunStatus } from './model.ts';

const columns = `id,status,started_at AS startedAt,ended_at AS endedAt,active_ms AS activeMs,
  checkpoint_at AS checkpointAt,distance_m AS distanceM,point_count AS pointCount,
  rejected_count AS rejectedCount,last_timestamp AS lastTimestamp,segment,break_pending AS breakPending,
  resumed_at AS resumedAt,reason`;
const pointColumns = 'sequence,segment,timestamp,latitude,longitude,accuracy';
async function read(tx: SqlExecutor, id: string) {
  const run = await tx.getFirstAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE id=?`, validateId(id));
  if (!run) throw new RunError('러닝 기록을 찾을 수 없어요.');
  return run;
}
export function createRunRepository(db: StorageDatabase, now = Date.now) {
  let tail: Promise<unknown> = Promise.resolve();
  function queue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task); tail = result.catch(() => {}); return result;
  }
  function transaction<T>(task: (tx: SqlExecutor) => Promise<T>) {
    return queue(async () => { let result!: T; await db.withExclusiveTransactionAsync(async tx => { result = await task(tx); }); return result; });
  }
  return {
    active: () => queue(() => db.getFirstAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE status!='completed' LIMIT 1`)),
    get: (id: string) => queue(() => read(db, id)),
    points: (id: string) => queue(() => db.getAllAsync<RunPoint>(`SELECT ${pointColumns} FROM running_points WHERE run_id=? ORDER BY sequence`, validateId(id))),
    list: (limit = 30, offset = 0) => queue(() => {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new RunError('목록 범위가 올바르지 않아요.');
      return db.getAllAsync<Run>(`SELECT ${columns} FROM running_sessions ORDER BY started_at DESC,id DESC LIMIT ? OFFSET ?`, limit, offset);
    }),
    start: () => transaction(async tx => {
      if (await tx.getFirstAsync("SELECT id FROM running_sessions WHERE status!='completed'")) throw new RunError('진행 중인 러닝을 먼저 재개하거나 종료해 주세요.');
      const at = now();
      const row = await tx.getFirstAsync<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
      if (!row) throw new Error('ID unavailable');
      await tx.runAsync(`INSERT INTO running_sessions(id,status,started_at,checkpoint_at,resumed_at) VALUES(?,'running',?,?,?)`, row.id, at, at, at);
      return read(tx, row.id);
    }),
    append: (fixes: readonly Fix[]) => transaction(async tx => {
      const run = await tx.getFirstAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE status='running'`);
      if (!run) return;
      const at = now();
      let last = await tx.getFirstAsync<RunPoint>(`SELECT ${pointColumns} FROM running_points WHERE run_id=? ORDER BY sequence DESC LIMIT 1`, run.id);
      // Sort a copied batch; duplicates/late deliveries are excluded by the persisted timestamp fence.
      for (const fix of [...fixes].sort((a, b) => a.timestamp - b.timestamp)) {
        const result = classifyFix(run, last, fix, at);
        if (result.kind === 'ignore') continue;
        // A future invalid timestamp must not poison all subsequent valid GPS fixes.
        if (fix.timestamp <= at + 5000) run.lastTimestamp = fix.timestamp;
        if (result.kind === 'reject') { run.rejectedCount++; run.breakPending = 1; continue; }
        if (result.kind === 'stationary') continue;
        if (run.pointCount >= 100000) throw new RunError('한 러닝의 기록 한도에 도달했어요. 현재 기록을 종료해 주세요.');
        run.pointCount++; run.segment = result.segment; run.distanceM += result.distance; run.breakPending = 0;
        last = { ...fix, sequence: run.pointCount, segment: run.segment };
        await tx.runAsync('INSERT INTO running_points(run_id,sequence,segment,timestamp,latitude,longitude,accuracy) VALUES(?,?,?,?,?,?,?)',
          run.id, last.sequence, last.segment, last.timestamp, last.latitude, last.longitude, last.accuracy);
      }
      await tx.runAsync(`UPDATE running_sessions SET active_ms=?,checkpoint_at=?,distance_m=?,point_count=?,rejected_count=?,
        last_timestamp=?,segment=?,break_pending=? WHERE id=?`, elapsedMs(run, at), Math.max(at, run.checkpointAt), run.distanceM,
      run.pointCount, run.rejectedCount, run.lastTimestamp, run.segment, run.breakPending, run.id);
    }),
    checkpoint: (id: string) => transaction(async tx => {
      const run = await read(tx, id), at = now();
      if (run.status === 'running') await tx.runAsync('UPDATE running_sessions SET active_ms=?,checkpoint_at=? WHERE id=?', elapsedMs(run, at), Math.max(at, run.checkpointAt), run.id);
    }),
    transition: (id: string, status: RunStatus, reason: string | null = null) => transaction(async tx => {
      const run = await read(tx, id), at = Math.max(now(), run.checkpointAt);
      if (run.status === 'completed') { if (status === 'completed') return run; throw new RunError('이미 종료한 러닝이에요.'); }
      if (status === run.status) return run;
      if (status === 'running' && run.status !== 'paused' && run.status !== 'interrupted') throw new RunError('재개할 수 없는 상태예요.');
      // An interruption uses only committed time; process downtime is never counted.
      const active = status === 'interrupted' ? run.activeMs : elapsedMs(run, at);
      await tx.runAsync(`UPDATE running_sessions SET status=?,active_ms=?,checkpoint_at=?,resumed_at=?,
        ended_at=?,break_pending=1,reason=? WHERE id=?`, status, active, at,
      status === 'running' ? at : run.resumedAt, status === 'completed' ? at : null, reason, run.id);
      return read(tx, id);
    }),
    remove: (id: string) => transaction(async tx => {
      const run = await read(tx, id);
      if (run.status !== 'completed') throw new RunError('러닝을 종료한 뒤 삭제할 수 있어요.');
      // Expo exclusive transactions open another connection; foreign_keys may be off there.
      await tx.runAsync('DELETE FROM running_points WHERE run_id=?', id);
      await tx.runAsync('DELETE FROM running_sessions WHERE id=?', id);
    }),
  };
}
export type RunRepository = ReturnType<typeof createRunRepository>;
