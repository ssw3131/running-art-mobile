import assert from 'node:assert/strict';
import test from 'node:test';
import { createRunController } from '../src/modules/running/controller.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { openSqlite } from './helpers/sqlite.mjs';

async function fixture(t) {
  const db = openSqlite(); t.after(() => db.closeAsync()); await migrateDatabase(db);
  let now = 1000000;
  const repo = createRunRepository(db, () => now);
  const calls = [], errors = {};
  const driver = {
    async prepare() { calls.push('prepare'); if (errors.permission) throw new Error('denied'); },
    async start() { calls.push('start'); if (errors.start) throw new Error('native failure'); },
    async stop() { calls.push('stop'); if (errors.stop) throw new Error('stop failure'); },
    async healthy() { return !errors.health; },
  };
  const controller = createRunController(async () => repo, driver);
  return { repo, calls, errors, controller, driver, time: value => { now = value; } };
}
test('permission failure creates no session or false tracking success', async t => {
  const { controller, repo, calls, errors } = await fixture(t); errors.permission = true;
  await assert.rejects(controller.start()); assert.equal(await repo.active(), null); assert.ok(!calls.includes('start'));
});
test('native start failure preserves a recoverable interrupted session and allows retry', async t => {
  const { controller, repo, errors } = await fixture(t); errors.start = true;
  await assert.rejects(controller.start()); const saved = await repo.active(); assert.equal(saved.status, 'interrupted');
  errors.start = false; await controller.resume(saved.id); assert.equal((await repo.active()).status, 'running');
  assert.equal(controller.error(), null);
});
test('cold UI launch stops stale native registration and truncates unknown downtime', async t => {
  const { controller, repo, time, driver } = await fixture(t); await controller.start();
  time(1005000); await controller.monitor(); time(9999000);
  const cold = createRunController(async () => repo, driver); await cold.recover();
  const restored = await repo.active(); assert.equal(restored.status, 'interrupted'); assert.equal(restored.activeMs, 5000);
  await cold.recover(); assert.equal((await repo.active()).activeMs, 5000);
});
test('pause/finish commit before stopping; failed stop can be retried without more recorded points', async t => {
  const { controller, repo, errors, time } = await fixture(t); const run = await controller.start();
  errors.stop = true; await assert.rejects(controller.pause(run.id)); assert.equal((await repo.active()).status, 'paused');
  time(1005000); await controller.ingest([{ timestamp: 1005000, latitude: 37, longitude: 127, accuracy: 5 }]);
  assert.equal((await repo.active()).pointCount, 0);
  errors.stop = false; await controller.pause(run.id); await controller.resume(run.id); await controller.finish(run.id);
  assert.equal(await repo.active(), null);
});
test('permission/service loss interrupts an existing run and stops native acquisition', async t => {
  const { controller, repo, errors, calls } = await fixture(t); await controller.start(); errors.health = true;
  await controller.monitor(); assert.equal((await repo.active()).status, 'interrupted'); assert.equal(calls.at(-1), 'stop');
});
test('background task error is persisted and native tracking stops', async t => {
  const { controller, repo, calls } = await fixture(t); await controller.start();
  await controller.ingest([], 'GPS 오류'); assert.equal((await repo.active()).reason, 'GPS 오류'); assert.equal(calls.at(-1), 'stop');
});
test('storage failure stops location service even if persisting interruption also fails', async () => {
  let stopped = 0;
  const controller = createRunController(async () => { throw new Error('storage unavailable'); }, {
    async prepare() {}, async start() {}, async stop() { stopped++; }, async healthy() { return true; },
  });
  await controller.ingest([]); assert.equal(stopped, 1); assert.match(controller.error(), /저장/);
});
test('cold headless task interrupts at the checkpoint without resuming or counting unknown downtime', async t => {
  const { repo, time, driver, calls } = await fixture(t); const active = await repo.start();
  const background = createRunController(async () => repo, driver); time(1005000);
  await background.ingest([{ timestamp: 1005000, latitude: 37, longitude: 127, accuracy: 5 }]);
  assert.equal((await repo.get(active.id)).pointCount, 0);
  assert.equal((await repo.get(active.id)).status, 'interrupted');
  assert.equal((await repo.get(active.id)).activeMs, 0); assert.deepEqual(calls, ['stop']);
});
test('same-process background deliveries persist while screens are absent', async t => {
  const { controller, repo, time } = await fixture(t); const run = await controller.start(); time(1005000);
  await controller.ingest([{ timestamp: 1005000, latitude: 37, longitude: 127, accuracy: 5 }]);
  assert.equal((await repo.get(run.id)).pointCount, 1); assert.equal((await repo.get(run.id)).status, 'running');
});
test('double start is serialized and only one native service starts', async t => {
  const { controller, calls } = await fixture(t);
  const results = await Promise.allSettled([controller.start(), controller.start()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(calls.filter(c => c === 'start').length, 1);
});
