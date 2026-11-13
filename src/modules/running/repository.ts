import type { SqlExecutor, StorageDatabase } from '../storage/types.ts';
import { serialDatabase } from '../storage/serial-database.ts';
import { guestScope, type OwnerScope } from '../sync/ownership.ts';
import { classifyFix, elapsedMs, RunError, validateId, type Fix, type Run, type RunPoint, type RunStatus } from './model.ts';
import { decodeSnapshot, encodeSnapshot,courseName as validateCourseName } from '../courses/model.ts';
import { type GuidanceEvent, type GuidanceFix } from '../guidance/engine.ts';
import { createRunGuidance, guidanceColumns, readRunGuidance, startReadiness, validateRunCourse, validateGuidanceOptions, type GuidanceOptions, type GuidanceRow } from './guidance.ts';
import { validApproach, type ApproachPlan } from './approach.ts';
import { buildSimulationRecord, isSimulationRun } from './simulation-record.ts';
import { recordedPaths } from './recorded-paths.ts';
import type { SimulationContinuation } from './simulation.ts';
import { defaultAccountPreferences, validatePreferences } from '../account/model.ts';

export const columns = `id,status,started_at AS startedAt,ended_at AS endedAt,active_ms AS activeMs,
  checkpoint_at AS checkpointAt,distance_m AS distanceM,point_count AS pointCount,
  rejected_count AS rejectedCount,last_timestamp AS lastTimestamp,segment,break_pending AS breakPending,
  resumed_at AS resumedAt,reason,course_id AS courseId,course_name AS courseName,course_outcome AS courseOutcome`;
export const pointColumns = 'sequence,segment,timestamp,latitude,longitude,accuracy';
export type FinishedRun=Run&{shape:string|null;originLat:number|null;originLng:number|null};
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
    simulationContinuation:(courseId:string)=>queue(async():Promise<SimulationContinuation|null>=>{
      const owner=scope();
      const row=await db.getFirstAsync<Run&GuidanceRow>(`SELECT ${columns},${guidanceColumns} FROM running_sessions WHERE owner_id=? AND course_id=? AND reason LIKE '[시뮬레이션]%' ORDER BY coalesce(ended_at,started_at) DESC,id DESC LIMIT 1`,owner,validateId(courseId));
      if(!row||row.status!=='completed'||row.courseOutcome!=='stopped'||!row.guidance_json)return null;
      const checkpoint=JSON.parse(row.guidance_json);if(checkpoint.version!==2||checkpoint.finished)return null;
      const points=await db.getAllAsync<RunPoint>(`SELECT ${pointColumns} FROM running_points WHERE run_id=? ORDER BY sequence`,row.id);
      if(scope()!==owner)throw new RunError('계정이 변경되었어요.');
      return {recordId:row.id,checkpoint,trace:recordedPaths(points),elapsedMs:row.activeMs,fixes:points.map(p=>({position:[p.longitude,p.latitude],accuracy:p.accuracy??30,timestamp:p.timestamp-row.startedAt}))};
    }),
    newSimulationId:()=>queue(async()=>{const row=await db.getFirstAsync<{id:string}>('SELECT lower(hex(randomblob(16))) AS id');if(!row)throw new RunError('기록 번호를 만들지 못했어요.');return row.id;}),
    saveSimulation:(input:{id:string;courseId:string;fixes:readonly GuidanceFix[];elapsedMs:number;continuedFrom?:string},expectedOwner:string)=>transaction(async tx=>{
      const check=()=>{if(scope()!==expectedOwner)throw new RunError('계정이 바뀌어 시뮬레이션 기록을 저장하지 않았어요.');};check();validateId(input.id);
      const existing=await tx.getFirstAsync<Run&{owner_id:string}>(`SELECT ${columns},owner_id FROM running_sessions WHERE id=?`,input.id);
      if(existing){if(existing.owner_id!==expectedOwner||!isSimulationRun(existing)||existing.courseId!==input.courseId)throw new RunError('다른 기록을 바꿀 수 없어요.');return existing;}
      if(await tx.getFirstAsync("SELECT id FROM running_sessions WHERE status!='completed'"))throw new RunError('실제 러닝을 종료한 뒤 시뮬레이션을 저장해 주세요.');
      const saved=await tx.getFirstAsync<{name:string;snapshot_json:string;snapshot_hash:string}>('SELECT name,snapshot_json,snapshot_hash FROM saved_courses WHERE id=? AND owner_id=?',validateId(input.courseId),expectedOwner);
      if(!saved)throw new RunError('내 계정의 코스를 찾을 수 없어요.');
      const course=validateRunCourse({id:input.courseId,name:saved.name,snapshot:decodeSnapshot(saved.snapshot_json,saved.snapshot_hash)});
      let continuation:Parameters<typeof buildSimulationRecord>[5];
      if(input.continuedFrom){
        const prior=await read(tx,validateId(input.continuedFrom),expectedOwner);
        const raw=await tx.getFirstAsync<GuidanceRow>(`SELECT ${guidanceColumns} FROM running_sessions WHERE id=?`,prior.id);
        if(!isSimulationRun(prior)||prior.status!=='completed'||prior.courseOutcome!=='stopped'||prior.courseId!==input.courseId||raw?.course_snapshot_hash!==saved.snapshot_hash||!raw.guidance_json)throw new RunError('이어서 달릴 시뮬레이션 기록을 확인할 수 없어요.');
        continuation={run:prior,points:await tx.getAllAsync<RunPoint>(`SELECT ${pointColumns} FROM running_points WHERE run_id=? ORDER BY sequence`,prior.id),checkpoint:JSON.parse(raw.guidance_json)};
      }
      const {run,points,checkpoint}=buildSimulationRecord(input.id,course,input.fixes,input.elapsedMs,now(),continuation);
      await tx.runAsync(`INSERT INTO running_sessions(id,status,started_at,ended_at,active_ms,checkpoint_at,resumed_at,distance_m,point_count,rejected_count,last_timestamp,segment,break_pending,reason,owner_id,course_id,course_name,course_outcome,course_snapshot_json,course_snapshot_hash,guidance_json,guidance_options_json)
        VALUES(?,'completed',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,run.id,run.startedAt,run.endedAt,run.activeMs,run.checkpointAt,run.resumedAt,run.distanceM,run.pointCount,run.rejectedCount,run.lastTimestamp,run.segment,run.breakPending,run.reason,expectedOwner,course.id,course.name,run.courseOutcome!,saved.snapshot_json,saved.snapshot_hash,JSON.stringify(checkpoint),JSON.stringify(defaultAccountPreferences.guidance));
      for(const point of points)await tx.runAsync('INSERT INTO running_points(run_id,sequence,segment,timestamp,latitude,longitude,accuracy) VALUES(?,?,?,?,?,?,?)',run.id,point.sequence,point.segment,point.timestamp,point.latitude,point.longitude,point.accuracy);
      check();return read(tx,run.id,expectedOwner);
    }),
    finished: (limit=30,offset=0) => queue(() => {
      if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)throw new RunError('목록 범위가 올바르지 않아요.');
      return db.getAllAsync<FinishedRun>(`SELECT ${columns},json_extract(course_snapshot_json,'$.shape') AS shape,
        json_extract(course_snapshot_json,'$.origin.lat') AS originLat,json_extract(course_snapshot_json,'$.origin.lng') AS originLng FROM running_sessions
        WHERE owner_id=? AND status='completed' AND course_outcome='finished' AND course_id IS NOT NULL ORDER BY COALESCE(ended_at,started_at) DESC,id DESC LIMIT ? OFFSET ?`,scope(),limit,offset);
    }),
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
    renameCourseRecord:(id:string,name:string)=>transaction(async tx=>{
      const owner=scope(),run=await read(tx,id,owner);
      if(run.status!=='completed'||!run.courseId)throw new RunError('종료된 코스 기록의 이름만 수정할 수 있어요.');
      await tx.runAsync('UPDATE running_sessions SET course_name=? WHERE id=? AND owner_id=?',validateCourseName(name),id,owner);
      if(scope()!==owner)throw new RunError('계정이 변경되었어요.');
    }),
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
        // Start a new attempt with the last real, unfinished attempt's committed
        // progress. Keep the old completed row immutable for sync/shared links.
        const previous = await tx.getFirstAsync<Run & GuidanceRow>(`SELECT ${columns},${guidanceColumns} FROM running_sessions
          WHERE owner_id=? AND id!=? AND (course_id=? OR course_snapshot_hash=?)
          AND (reason IS NULL OR reason NOT LIKE '[시뮬레이션]%')
          ORDER BY coalesce(ended_at,started_at) DESC,started_at DESC,id DESC LIMIT 1`,owner,row.id,courseId,course.snapshot_hash);
        const continuation=previous?.status==='completed'&&previous.courseOutcome==='stopped'&&previous.guidance_json&&previous.course_snapshot_hash===course.snapshot_hash?previous:null;
        const engine = createRunGuidance(snapshot.route, continuation ? JSON.parse(continuation.guidance_json!) : undefined, continuation ? undefined : approach);
        if(continuation){
          engine.resume();
          await tx.runAsync(`UPDATE running_sessions SET started_at=?,active_ms=?,distance_m=?,point_count=?,rejected_count=?,last_timestamp=?,segment=?,break_pending=1 WHERE id=?`,
            continuation.startedAt,continuation.activeMs,continuation.distanceM,continuation.pointCount,continuation.rejectedCount,continuation.lastTimestamp,continuation.segment,row.id);
          await tx.runAsync(`INSERT INTO running_points(run_id,sequence,segment,timestamp,latitude,longitude,accuracy)
            SELECT ?,sequence,segment,timestamp,latitude,longitude,accuracy FROM running_points WHERE run_id=?`,row.id,continuation.id);
        }
        engine.ingest({ position: [initialFix!.longitude, initialFix!.latitude], accuracy: initialFix!.accuracy!, timestamp: continuation ? at-continuation.startedAt : 0 });
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
