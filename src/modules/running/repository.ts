import type { SqlExecutor, StorageDatabase } from '../storage/types.ts';
import { serialDatabase } from '../storage/serial-database.ts';
import { guestScope, type OwnerScope } from '../sync/ownership.ts';
import { classifyFix, elapsedMs, RunError, validateId, type Fix, type Run, type RunPoint, type RunStatus } from './model.ts';
import { decodeSnapshot, encodeSnapshot } from '../courses/model.ts';
import { type GuidanceEvent } from '../guidance/engine.ts';
import { createRunGuidance, guidanceColumns, readRunGuidance, startReadiness, validateGuidanceOptions, type GuidanceOptions, type GuidanceRow } from './guidance.ts';
import { validApproach, type ApproachPlan } from './approach.ts';
import { defaultAccountPreferences, validatePreferences } from '../account/model.ts';

export const columns = `id,status,started_at AS startedAt,ended_at AS endedAt,active_ms AS activeMs,
  checkpoint_at AS checkpointAt,distance_m AS distanceM,point_count AS pointCount,
  rejected_count AS rejectedCount,last_timestamp AS lastTimestamp,segment,break_pending AS breakPending,
  resumed_at AS resumedAt,reason,course_id AS courseId,course_name AS courseName,course_outcome AS courseOutcome`;
export const pointColumns = 'sequence,segment,timestamp,latitude,longitude,accuracy';
async function read(tx: SqlExecutor, id: string, owner: string) {
  const run = await tx.getFirstAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE id=? AND owner_id=?`, validateId(id), owner);
  if (!run) throw new RunError('러닝 기록을 찾을 수 없어요.');
  return run;
}
export function createRunRepository(db: StorageDatabase, now = Date.now, scope: OwnerScope = guestScope) {
  db = serialDatabase(db);
  let tail: Promise<unknown> = Promise.resolve();
  function queue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task); tail = result.catch(() => {}); return result;
  }
  function transaction<T>(task: (tx: SqlExecutor) => Promise<T>) {
    return queue(async () => { let result!: T; await db.withExclusiveTransactionAsync(async tx => { result = await task(tx); }); return result; });
  }
  return {
    course: (id: string) => queue(async () => {
      const row = await db.getFirstAsync<{name:string;snapshot_json:string;snapshot_hash:string}>('SELECT name,snapshot_json,snapshot_hash FROM saved_courses WHERE id=? AND owner_id=?',validateId(id),scope());
      if(!row)throw new RunError('내 계정의 저장 코스를 찾을 수 없어요.');
      return {id,name:row.name,snapshot:decodeSnapshot(row.snapshot_json,row.snapshot_hash)};
    }),
    setNavigation: (id: string,key: string,plan: ApproachPlan|null,error: string|null) => transaction(async tx => {
      const run=await read(tx,id,scope());if(run.status!=='running'||!run.courseId)return;
      const guide=readRunGuidance((await tx.getFirstAsync<GuidanceRow>(`SELECT ${guidanceColumns} FROM running_sessions WHERE id=?`,id))!)!;
      const engine=createRunGuidance(guide.course.snapshot.route,guide.checkpoint);
      if(!('navigationRequest' in engine)||engine.navigationRequest()?.key!==key)return;
      if(plan){try{validApproach(plan,guide.course.snapshot,engine.snapshot().position);}catch{return;}}
      engine.setNavigation(plan,error);
      await tx.runAsync('UPDATE running_sessions SET guidance_json=? WHERE id=?',JSON.stringify(engine.checkpoint()),id);
    }),
    active: () => queue(() => db.getFirstAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE status!='completed' AND owner_id=? LIMIT 1`, scope())),
    get: (id: string) => queue(() => read(db, id, scope())),
    guidance: (id: string) => queue(async () => {
      await read(db, id, scope());
      return readRunGuidance((await db.getFirstAsync<GuidanceRow>(`SELECT ${guidanceColumns} FROM running_sessions WHERE id=?`, id))!);
    }),
    setGuidanceOptions: (id: string, options: GuidanceOptions) => transaction(async tx => {
      const run = await read(tx, id, scope());
      if (!run.courseId || run.status === 'completed') throw new RunError('진행 중인 코스 러닝에서 설정해 주세요.');
      await tx.runAsync('UPDATE running_sessions SET guidance_options_json=? WHERE id=?', JSON.stringify(validateGuidanceOptions(options)), id);
    }),
    points: (id: string) => queue(async () => { await read(db, id, scope()); return db.getAllAsync<RunPoint>(`SELECT ${pointColumns} FROM running_points WHERE run_id=? ORDER BY sequence`, validateId(id)); }),
    list: (limit = 30, offset = 0) => queue(() => {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new RunError('목록 범위가 올바르지 않아요.');
      return db.getAllAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE owner_id=? ORDER BY started_at DESC,id DESC LIMIT ? OFFSET ?`, scope(), limit, offset);
    }),
    start: (courseId?: string, initialFix?: Fix, approach?: ApproachPlan) => transaction(async tx => {
      if (await tx.getFirstAsync("SELECT id FROM running_sessions WHERE status!='completed'")) throw new RunError('진행 중인 러닝을 먼저 재개하거나 종료해 주세요.');
      const at = now();
      const row = await tx.getFirstAsync<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
      if (!row) throw new Error('ID unavailable');
      const owner = scope();
      await tx.runAsync(`INSERT INTO running_sessions(id,status,started_at,checkpoint_at,resumed_at,owner_id) VALUES(?,'running',?,?,?,?)`, row.id, at, at, at, owner);
      if (courseId) {
        const course = await tx.getFirstAsync<{ name: string; snapshot_json: string; snapshot_hash: string }>('SELECT name,snapshot_json,snapshot_hash FROM saved_courses WHERE id=? AND owner_id=?', validateId(courseId), owner);
        if (!course) throw new RunError('내 계정의 저장 코스를 찾을 수 없어요.');
        const snapshot = decodeSnapshot(course.snapshot_json, course.snapshot_hash);
        if (snapshot.source !== 'osm') throw new RunError('가상 테스트 코스는 실제 GPS 러닝에 사용할 수 없어요.');
        const readiness = startReadiness({ id: courseId, name: course.name, snapshot }, initialFix ?? null, at, approach);
        if (!readiness.ready) throw new RunError(readiness.message);
        if(approach)validApproach(approach,snapshot,[initialFix!.longitude,initialFix!.latitude]);
        const engine = createRunGuidance(snapshot.route, undefined, approach);
        engine.ingest({ position: [initialFix!.longitude, initialFix!.latitude], accuracy: initialFix!.accuracy!, timestamp: 0 });
        const encoded = encodeSnapshot(snapshot);
        const preferences = await tx.getFirstAsync<{ preferences_json: string }>('SELECT preferences_json FROM account_preferences WHERE owner_id=?', owner);
        const options = validatePreferences(preferences ? JSON.parse(preferences.preferences_json) : defaultAccountPreferences).guidance;
        await tx.runAsync(`UPDATE running_sessions SET course_id=?,course_name=?,course_outcome='active',course_snapshot_json=?,course_snapshot_hash=?,guidance_json=?,guidance_options_json=? WHERE id=?`,
          courseId, course.name, encoded.json, encoded.hash, JSON.stringify(engine.checkpoint()), JSON.stringify(options), row.id);
      }
      return read(tx, row.id, owner);
    }),
    append: (fixes: readonly Fix[]) => transaction(async tx => {
      const run = await tx.getFirstAsync<Run>(`SELECT ${columns} FROM running_sessions WHERE status='running' AND owner_id=?`, scope());
      if (!run) return { events: [] as GuidanceEvent[], paused: false, voice: false };
      const at = now();
      const saved = run.courseId ? readRunGuidance((await tx.getFirstAsync<GuidanceRow>(`SELECT ${guidanceColumns} FROM running_sessions WHERE id=?`, run.id))!) : null;
      const engine = saved ? createRunGuidance(saved.course.snapshot.route, saved.checkpoint) : null;
      const events: GuidanceEvent[] = [];
      let arrivedAt: number | null = null;
      let last = await tx.getFirstAsync<RunPoint>(`SELECT ${pointColumns} FROM running_points WHERE run_id=? ORDER BY sequence DESC LIMIT 1`, run.id);
      // Sort a copied batch; duplicates/late deliveries are excluded by the persisted timestamp fence.
      for (const fix of [...fixes].sort((a, b) => a.timestamp - b.timestamp)) {
        const result = classifyFix(run, last, fix, at);
        if (result.kind === 'ignore') continue;
        // Guidance sees stationary fixes and poor-accuracy reports too. Only
        // record distance uses the jitter filter; future/old samples cannot guide.
        if (engine && fix.timestamp <= at && at - fix.timestamp <= 60000) {
          const state = engine.ingest({ position: [fix.longitude, fix.latitude], accuracy: fix.accuracy ?? Infinity, timestamp: fix.timestamp - run.startedAt });
          if (state.status === 'arrived') arrivedAt = fix.timestamp;
        }
        // A future invalid timestamp must not poison all subsequent valid GPS fixes.
        if (fix.timestamp <= at + 5000) run.lastTimestamp = fix.timestamp;
        if (result.kind === 'reject') { run.rejectedCount++; run.breakPending = 1; continue; }
        if (result.kind === 'stationary') { if (arrivedAt !== null) break; continue; }
        if (run.pointCount >= 100000) throw new RunError('한 러닝의 기록 한도에 도달했어요. 현재 기록을 종료해 주세요.');
        run.pointCount++; run.segment = result.segment; run.distanceM += result.distance; run.breakPending = 0;
        last = { ...fix, sequence: run.pointCount, segment: run.segment };
        await tx.runAsync('INSERT INTO running_points(run_id,sequence,segment,timestamp,latitude,longitude,accuracy) VALUES(?,?,?,?,?,?,?)',
          run.id, last.sequence, last.segment, last.timestamp, last.latitude, last.longitude, last.accuracy);
        if (arrivedAt !== null) break;
      }
      const checkpointAt = arrivedAt === null ? at : Math.max(run.checkpointAt, arrivedAt);
      await tx.runAsync(`UPDATE running_sessions SET active_ms=?,checkpoint_at=?,distance_m=?,point_count=?,rejected_count=?,
        last_timestamp=?,segment=?,break_pending=? WHERE id=?`, elapsedMs(run, checkpointAt), Math.max(checkpointAt, run.checkpointAt), run.distanceM,
      run.pointCount, run.rejectedCount, run.lastTimestamp, run.segment, run.breakPending, run.id);
      if (engine) {
        events.push(...engine.snapshot().events.filter(event => at - run.startedAt - event.timestamp <= 5000));
        await tx.runAsync('UPDATE running_sessions SET guidance_json=? WHERE id=?', JSON.stringify(engine.checkpoint()), run.id);
        if (arrivedAt !== null) await tx.runAsync("UPDATE running_sessions SET status='paused',course_outcome='arrival-pending',break_pending=1,reason='완주를 감지해 일시정지했어요. 종료·저장하거나 계속 달릴 수 있어요.' WHERE id=?", run.id);
      }
      return { events, paused: arrivedAt !== null, voice: saved?.options.voice ?? false };
    }),
    checkpoint: (id: string) => transaction(async tx => {
      const run = await read(tx, id, scope()), at = now();
      if (run.status === 'running') await tx.runAsync('UPDATE running_sessions SET active_ms=?,checkpoint_at=? WHERE id=?', elapsedMs(run, at), Math.max(at, run.checkpointAt), run.id);
    }),
    transition: (id: string, status: RunStatus, reason: string | null = null) => transaction(async tx => {
      const run = await read(tx, id, scope()), at = Math.max(now(), run.checkpointAt);
      if (run.status === 'completed') { if (status === 'completed') return run; throw new RunError('이미 종료한 러닝이에요.'); }
      if (status === run.status) return run;
      if (status === 'running' && run.status !== 'paused' && run.status !== 'interrupted') throw new RunError('재개할 수 없는 상태예요.');
      if (run.courseId) {
        const saved = readRunGuidance((await tx.getFirstAsync<GuidanceRow>(`SELECT ${guidanceColumns} FROM running_sessions WHERE id=?`, id))!)!;
        if (status === 'running') {
          const engine = createRunGuidance(saved.course.snapshot.route, saved.checkpoint); engine.resume();
          await tx.runAsync("UPDATE running_sessions SET guidance_json=?,course_outcome='active' WHERE id=?", JSON.stringify(engine.checkpoint()), id);
        } else if (status === 'completed') {
          await tx.runAsync('UPDATE running_sessions SET course_outcome=? WHERE id=?', run.courseOutcome === 'arrival-pending' || (saved.checkpoint.version===2&&saved.checkpoint.finished) ? 'finished' : 'stopped', id);
        }
      }
      // An interruption uses only committed time; process downtime is never counted.
      const active = status === 'interrupted' ? run.activeMs : elapsedMs(run, at);
      await tx.runAsync(`UPDATE running_sessions SET status=?,active_ms=?,checkpoint_at=?,resumed_at=?,
        ended_at=?,break_pending=1,reason=? WHERE id=?`, status, active, at,
      status === 'running' ? at : run.resumedAt, status === 'completed' ? at : null, reason, run.id);
      return read(tx, id, scope());
    }),
    remove: (id: string) => transaction(async tx => {
      const run = await read(tx, id, scope());
      if (run.status !== 'completed') throw new RunError('러닝을 종료한 뒤 삭제할 수 있어요.');
      // Expo exclusive transactions open another connection; foreign_keys may be off there.
      await tx.runAsync('DELETE FROM running_points WHERE run_id=?', id);
      await tx.runAsync('DELETE FROM running_sessions WHERE id=?', id);
    }),
  };
}
export type RunRepository = ReturnType<typeof createRunRepository>;
