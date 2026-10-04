import type { Run, RunPoint } from '../running/model.ts';
import type { RunCourse } from '../running/guidance.ts';
import { makeSharedRun, RunShareError, shareUrl } from './model.ts';
import type { RunShareRemote } from './remote.ts';

export function createRunSharing(deps: {
  base: string; owner(): string | null;
  load(id: string): Promise<{ run: Run; points: RunPoint[]; course: RunCourse | null }>;
  sync(owner: string): Promise<void>;
  remote(owner: string): Promise<RunShareRemote>;
  exclusive(work: () => Promise<void>): Promise<void>;
}) {
  function check(owner: string) {
    if (!owner || deps.owner() !== owner) throw new RunShareError('이 기록을 보관한 계정으로 로그인해 주세요.');
  }
  return {
    current: async (id: string, owner: string) => {
      check(owner); const remote = await deps.remote(owner); check(owner);
      const token = await remote.current(id); check(owner);
      return token ? shareUrl(deps.base, token) : null;
    },
    publish: async (id: string, owner: string) => {
      let url = '';
      await deps.exclusive(async () => {
        check(owner);
        // Read before syncing as well, so another account's stale screen cannot
        // cause an unrelated upload. Reload after sync in case conflict resolved.
        await deps.load(id); check(owner);
        await deps.sync(owner); check(owner);
        const { run, points, course } = await deps.load(id); check(owner);
        const snapshot = makeSharedRun(run, points, course);
        const remote = await deps.remote(owner); check(owner);
        const token = await remote.publish(id, snapshot); check(owner);
        url = shareUrl(deps.base, token);
      });
      return url;
    },
    revoke: async (id: string, owner: string) => {
      await deps.exclusive(async () => {
        check(owner); const remote = await deps.remote(owner); check(owner);
        await remote.revoke(id); check(owner);
      });
    },
  };
}
