import { RunError, type Fix } from './model.ts';
import type { RunRepository } from './repository.ts';
import type { GuidanceEvent } from '../guidance/engine.ts';
import { createRunGuidance, startReadiness } from './guidance.ts';
import type { ApproachPlan, ApproachPlanner } from './approach.ts';

export interface TrackingDriver {
  prepare(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  healthy(): Promise<boolean>;
  locate?(): Promise<Fix>;
  feedback?(events: readonly GuidanceEvent[], voice: boolean): void;
  silence?(): void;
  foreground?(): boolean;
}
export function createRunController(repository: () => Promise<RunRepository>, driver: TrackingDriver, planner?: ApproachPlanner) {
  let tail: Promise<unknown> = Promise.resolve(), recovered = false;
  let failure: string | null = null;
  let preparing: AbortController | null = null, navigating: AbortController | null = null, nextNavigation = 0;
  async function scheduleNavigation(repo: RunRepository,force=false) {
    if(!planner||navigating||(!force&&Date.now()<nextNavigation))return;
    const run=await repo.active();if(!run?.courseId||run.status!=='running')return;
    const guide=await repo.guidance(run.id);if(!guide)return;
    const engine=createRunGuidance(guide.course.snapshot.route,guide.checkpoint);
    if(!('navigationRequest' in engine))return;
    const request=engine.navigationRequest();if(!request||engine.snapshot().status==='weak')return;
    const cancel=new AbortController();navigating=cancel;nextNavigation=Date.now()+15000;
    // Never hold the GPS queue or a SQLite transaction during road I/O/routing.
    void planner({course:guide.course.snapshot,position:request.position,accuracy:30,targetM:request.targetM},cancel.signal)
      .then(plan=>cancel.signal.aborted?undefined:queue(()=>repo.setNavigation(run.id,request.key,plan,null)),error=>cancel.signal.aborted?undefined:queue(()=>repo.setNavigation(run.id,request.key,null,error instanceof Error?error.message:'복귀 경로를 확인하지 못했어요. 다시 시도해 주세요.')))
      .catch(()=>{}).finally(()=>{if(navigating===cancel)navigating=null;});
  }
  function queue<T>(work: () => Promise<T>) { const result = tail.then(work); tail = result.catch(() => {}); return result; }
  async function stop() {
    navigating?.abort();navigating=null;
    try { driver.silence?.(); await driver.stop(); }
    catch { throw new RunError('위치 서비스를 끄지 못했어요. 다시 시도해 주세요. 추가 좌표는 기록에 반영하지 않아요.'); }
  }
  async function recover(repo: RunRepository) {
    if (recovered) return;
    const active = await repo.active();
    if (active?.status === 'running') await repo.transition(active.id, 'interrupted', '앱이 다시 시작되어 마지막 저장 지점에서 중단했어요. 재개하거나 종료할 수 있어요.');
    await stop();
    recovered = true;
  }
  async function fail(repo: RunRepository, message: string) {
    failure = message;
    try {
      const active = await repo.active();
      if (active?.status === 'running') await repo.transition(active.id, 'interrupted', message);
    } finally { await stop(); }
  }
  return {
    cancelPreparation: () => { preparing?.abort(); },
    retryNavigation: () => queue(async()=>{navigating?.abort();navigating=null;nextNavigation=0;await scheduleNavigation(await repository(),true);}),
    recover: () => queue(async () => { const repo = await repository(); await recover(repo); }),
    start: (courseId?: string) => queue(async () => {
      const cancel=new AbortController();preparing=cancel;
      const check=()=>{if(cancel.signal.aborted)throw new RunError('러닝 준비를 취소했어요.');};
      try {
      const repo = await repository(); await recover(repo);
      if (await repo.active()) throw new RunError('진행 중인 러닝을 먼저 재개하거나 종료해 주세요.');
      await driver.prepare();
      check();
      let fix = courseId ? await driver.locate?.() : undefined;
      let approach: ApproachPlan | undefined;
      if(courseId&&fix){
        const course=await repo.course(courseId),ready=startReadiness(course,fix,Date.now());
        if(!ready.ready && ready.distanceM!==null && planner){
          try {
            approach=await planner({course:course.snapshot,position:[fix.longitude,fix.latitude],accuracy:fix.accuracy??30},cancel.signal);
            if(cancel.signal.aborted)throw new RunError('합류 경로 준비를 취소했어요.');
            fix=await driver.locate?.();
            if(cancel.signal.aborted)throw new RunError('합류 경로 준비를 취소했어요.');
          }catch(error){throw new RunError(error instanceof Error?error.message:'합류 경로를 확인하지 못했어요.');}
        }
      }
      check();
      const run = await repo.start(courseId, fix, approach);
      try { await driver.start(); failure = null; }
      catch { await fail(repo, 'GPS 추적을 시작하지 못했어요. 위치 권한을 확인하고 재개해 주세요.'); throw new RunError(failure!); }
      return run;
      } finally {if(preparing===cancel)preparing=null;}
    }),
    resume: (id: string) => queue(async () => {
      const repo = await repository(); await recover(repo);
      const run = await repo.get(id);
      if (run.status === 'running') return;
      if (run.status === 'completed') throw new RunError('이미 종료한 러닝이에요.');
      // Always clean up a previous failed stop before registering a new stream.
      await stop(); await driver.prepare();
      await repo.transition(id, 'running');
      try { await driver.start(); failure = null; }
      catch { await fail(repo, 'GPS 추적을 재개하지 못했어요. 다시 시도해 주세요.'); throw new RunError(failure!); }
    }),
    pause: (id: string) => queue(async () => {
      const repo = await repository(); await recover(repo);
      try { await repo.transition(id, 'paused'); }
      catch (error) { await fail(repo, '일시정지 상태를 저장하지 못해 추적을 중단했어요. 저장 공간을 확인해 주세요.'); throw error; }
      await stop();
    }),
    finish: (id: string) => queue(async () => {
      const repo = await repository(); await recover(repo);
      try { await repo.transition(id, 'completed'); }
      catch (error) { await fail(repo, '종료 상태를 저장하지 못해 추적을 중단했어요. 다시 종료해 주세요.'); throw error; }
      await stop(); failure = null;
    }),
    monitor: () => queue(async () => {
      const repo = await repository(); await recover(repo);
      const active = await repo.active();
      if (active?.status === 'running') {
        try {
          const guide = active.courseId ? await repo.guidance(active.id) : null;
          if (guide && !guide.options.background && driver.foreground?.() === false) {
            await repo.transition(active.id, 'paused', '화면 꺼짐 안내를 꺼서 일시정지했어요. 앱에서 재개해 주세요.'); await stop();
          } else if (failure || !await driver.healthy()) await fail(repo, failure ?? '위치 권한 또는 위치 서비스가 꺼져 기록을 중단했어요.');
          else { await repo.checkpoint(active.id); await scheduleNavigation(repo); }
        } catch (error) { await fail(repo, '러닝 상태를 확인하거나 저장하지 못해 추적을 중단했어요. 다시 시도해 주세요.'); throw error; }
      } else await stop();
      return repo.active();
    }),
    ingest: (fixes: readonly Fix[], error?: string) => queue(async () => {
      // A fresh headless JS process has unknown downtime too. Preserve the last
      // checkpoint and require explicit resume instead of silently restarting GPS.
      let repo: RunRepository | undefined;
      try {
        repo = await repository();
        await recover(repo);
        if (error || failure) { await fail(repo, error ?? failure!); return; }
        const result = await repo.append(fixes);
        // Effects follow the transaction, so a failed write never announces a
        // successful arrival. Stopping the GPS service does not discard the run.
        if (result.paused) await stop();
        driver.feedback?.(result.events, result.voice);
        if(!result.paused)await scheduleNavigation(repo);
      } catch {
        failure = 'GPS 기록 저장에 실패해 추적을 중단했어요. 저장 공간을 확인한 뒤 재개해 주세요.';
        if (repo) await fail(repo, failure).catch(() => {});
        else await driver.stop().catch(() => {});
      }
    }),
    error: () => failure,
  };
}
