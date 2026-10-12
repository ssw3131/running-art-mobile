import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { A, snapshot, device, cloud, sync } from './helpers/sync-fixture.mjs';
import { resolveConflict } from '../src/modules/sync/engine.ts';
const seed = Number(process.env.FC_SEED ?? 20261013);
const parameters = { seed, numRuns: 40, verbose: true, ...(process.env.FC_PATH ? { path: process.env.FC_PATH } : {}) };

test(`PROPERTY-SYNC-01: generated rename/offline/lost-response/retry sequences (seed ${seed})`, async () => {
  await fc.assert(fc.asyncProperty(fc.array(fc.constantFrom('rename', 'offline', 'lost', 'sync', 'duplicate'), { minLength: 1, maxLength: 35 }), async commands => {
    const cleanup = [], t = { after: fn => cleanup.push(fn) };
    try {
      const first = await device(t), second = await device(t), remote = cloud();
      let name = '최초'; const saved = await first.courses.save(snapshot(), name);
      await first.sync.enable(A, false); await second.sync.enable(A, false);
      for (const [index, command] of commands.entries()) {
        if (command === 'rename') { name = `수정 ${index}`; await first.courses.rename(saved.id, name); }
        if (command === 'duplicate') {
          const repeated = await first.courses.save(snapshot(), '덮어쓰면 안 되는 이름');
          assert.equal(repeated.id, saved.id); assert.equal(repeated.created, false);
        }
        if (command === 'offline') remote.hooks.upload = () => { throw Error('injected disconnected transport'); };
        if (command === 'lost') remote.hooks.afterCommit = () => { delete remote.hooks.afterCommit; throw Error('injected lost response'); };
        if (['offline', 'lost', 'sync'].includes(command)) {
          try { await sync(first, remote); } catch (error) { assert.match(error.message, /injected/); }
          delete remote.hooks.upload; delete remote.hooks.afterCommit;
        }
        assert.equal((await first.courses.get(saved.id)).name, name);
        assert.equal((await first.courses.list()).length, 1, 'duplicate persistence must be caught');
      }
      await sync(first, remote);
      // A lost commit followed by an offline edit correctly requires an explicit
      // conflict choice; model that user action rather than expecting auto-merge.
      for (const conflict of (await first.sync.status(A)).conflicts) {
        await resolveConflict({ owner: A, repository: first.sync, remote: remote.remote(A), conflict, choice: 'local', check: () => {} });
      }
      await sync(first, remote); await sync(second, remote); await sync(second, remote);
      assert.deepEqual(await second.courses.get(saved.id), await first.courses.get(saved.id));
      assert.equal((await second.courses.list()).length, 1);
      assert.equal((await first.sync.status(A)).pending, 0);
    } finally { for (const close of cleanup) await close(); }
  }), parameters);
});

test(`PROPERTY-RUN-01: repeated pause/resume and duplicate samples preserve unique points (seed ${seed})`, async () => {
  await fc.assert(fc.asyncProperty(fc.array(fc.constantFrom('point', 'duplicate', 'pause', 'resume'), { minLength: 1, maxLength: 40 }), async commands => {
    const cleanup = [], d = await device({ after: fn => cleanup.push(fn) });
    try {
      const run = await d.runs.start(); let at = 1000000, paused = false, last;
      for (const command of commands) {
        at += 5000; d.time(at);
        if (command === 'pause' && !paused) { await d.runs.transition(run.id, 'paused'); paused = true; }
        if (command === 'resume' && paused) { await d.runs.transition(run.id, 'running'); paused = false; }
        if (command === 'point') { last = { timestamp: at, latitude: 0, longitude: (at - 1000000) / 1e9, accuracy: 4 }; await d.runs.append([last]); }
        if (command === 'duplicate' && last) await d.runs.append([last, last]);
        const points = await d.runs.points(run.id);
        assert.equal(new Set(points.map(point => point.timestamp)).size, points.length);
      }
      await d.runs.transition(run.id, 'completed');
      assert.equal(await d.runs.active(), null);
      assert.equal((await d.runs.get(run.id)).status, 'completed');
    } finally { for (const close of cleanup) await close(); }
  }), parameters);
});
