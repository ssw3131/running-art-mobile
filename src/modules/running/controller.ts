import { RunError, type Fix } from './model.ts';
import type { RunRepository } from './repository.ts';

export interface TrackingDriver {
  prepare(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  healthy(): Promise<boolean>;
}
export function createRunController(repository: () => Promise<RunRepository>, driver: TrackingDriver) {
  let tail: Promise<unknown> = Promise.resolve(), recovered = false;
  let failure: string | null = null;
  function queue<T>(work: () => Promise<T>) { const result = tail.then(work); tail = result.catch(() => {}); return result; }
  async function stop() {
    try { await driver.stop(); }
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
    recover: () => queue(async () => { const repo = await repository(); await recover(repo); }),
    start: () => queue(async () => {
      const repo = await repository(); await recover(repo);
      if (await repo.active()) throw new RunError('진행 중인 러닝을 먼저 재개하거나 종료해 주세요.');
      await driver.prepare();
      const run = await repo.start();
      try { await driver.start(); failure = null; }
      catch { await fail(repo, 'GPS 추적을 시작하지 못했어요. 위치 권한을 확인하고 재개해 주세요.'); throw new RunError(failure!); }
      return run;
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
          if (failure || !await driver.healthy()) await fail(repo, failure ?? '위치 권한 또는 위치 서비스가 꺼져 기록을 중단했어요.');
          else await repo.checkpoint(active.id);
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
        await repo.append(fixes);
      } catch {
        failure = 'GPS 기록 저장에 실패해 추적을 중단했어요. 저장 공간을 확인한 뒤 재개해 주세요.';
        if (repo) await fail(repo, failure).catch(() => {});
        else await driver.stop().catch(() => {});
      }
    }),
    error: () => failure,
  };
}
