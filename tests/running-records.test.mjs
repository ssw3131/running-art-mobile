import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase, migrations } from '../src/modules/storage/migrations.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { distanceMeters, durationLabel, paceLabel } from '../src/modules/running/model.ts';

const BASE = 1800000000000;
const fix = (seconds, meters = seconds * 3, accuracy = 5) => ({ timestamp: BASE + seconds * 1000, latitude: 37 + meters / 111195.0802, longitude: 127, accuracy });
async function fixture(t, options = {}) {
  const db = openSqlite(':memory:', options); t.after(() => db.closeAsync()); await migrateDatabase(db);
  let clock = BASE;
  return { db, repo: createRunRepository(db, () => clock), time: seconds => { clock = BASE + seconds * 1000; } };
}
test('GPS samples survive pause, late deliveries, resume and finish with accurate active duration', async t => {
  const { repo, time } = await fixture(t); const run = await repo.start();
  time(10); await repo.append([fix(0), fix(5), fix(10)]);
  assert.ok(Math.abs((await repo.get(run.id)).distanceM - 30) < 0.01);
  time(12); await repo.transition(run.id, 'paused');
  time(25); await repo.append([fix(20, 500)]); // Paused updates cannot mutate the session.
  time(30); await repo.transition(run.id, 'running');
  time(40); await repo.append([fix(15, 45), fix(30, 1000), fix(35, 1015), fix(40, 1030)]);
  time(42); const done = await repo.transition(run.id, 'completed');
  assert.equal(done.activeMs, 24000); assert.ok(Math.abs(done.distanceM - 60) < 0.01);
  assert.deepEqual((await repo.points(run.id)).map(p => p.segment), [0, 0, 0, 1, 1, 1]);
  await repo.append([fix(45)]); assert.equal((await repo.get(run.id)).pointCount, 6);
  await assert.rejects(repo.transition(run.id, 'running')); assert.equal(await repo.active(), null);
  await repo.transition(run.id, 'completed'); // Idempotent finish.
});
test('accuracy failures, speed jumps and GPS gaps never bridge missing paths', async t => {
  const { repo, time } = await fixture(t); const run = await repo.start();
  time(60); await repo.append([fix(0), fix(5), fix(6, 18, 100), fix(10, 800), fix(15, 815), fix(16, 10000), fix(20, 830), fix(50, 920), fix(55, 935)]);
  const saved = await repo.get(run.id), points = await repo.points(run.id);
  assert.equal(saved.rejectedCount, 2); assert.equal(saved.pointCount, 7);
  assert.ok(Math.abs(saved.distanceM - 45) < 0.01);
  assert.deepEqual(points.map(p => p.segment), [0, 0, 1, 1, 2, 3, 3]);
});
test('duplicate/out-of-order batches, future timestamps and non-finite coordinates cannot corrupt GPS storage', async t => {
  const { repo, time } = await fixture(t); const run = await repo.start();
  time(10); await repo.append([fix(10), fix(0), fix(5), fix(5)]); await repo.append([fix(5), fix(10)]);
  time(20); await repo.append([{ ...fix(11), latitude: NaN }, { ...fix(12), longitude: 181 }, fix(13, 39, null), fix(14, 42, -1), fix(9999), fix(20)]);
  time(25); await repo.append([fix(25)]);
  const saved = await repo.get(run.id);
  assert.equal(saved.pointCount, 5); assert.equal(saved.rejectedCount, 5);
  assert.equal(saved.lastTimestamp, fix(25).timestamp);
});
test('jitter stays at the last accepted anchor until meaningful movement arrives', async t => {
  const { repo, time } = await fixture(t); const run = await repo.start();
  time(6); await repo.append([fix(0, 0), fix(1, 1), fix(2, 0), fix(3, 2), fix(4, 0), fix(5, 5)]);
  assert.equal((await repo.get(run.id)).pointCount, 2);
  assert.ok(Math.abs((await repo.get(run.id)).distanceM - 5) < 0.01);
});
test('GPS silence advances activity time but does not invent distance; interruption excludes downtime', async t => {
  const { repo, time } = await fixture(t); const run = await repo.start();
  time(10); await repo.append([fix(0), fix(5), fix(10)]);
  time(25); await repo.checkpoint(run.id);
  time(300); const restored = await repo.transition(run.id, 'interrupted', '중단');
  assert.equal(restored.activeMs, 25000); assert.ok(restored.distanceM < 31);
  time(400); await repo.transition(run.id, 'running');
  time(410); await repo.append([fix(400, 2000), fix(405, 2015), fix(410, 2030)]);
  assert.equal((await repo.get(run.id)).activeMs, 35000);
});
test('partial point/summary write rolls back as a single transaction and can be retried', async t => {
  let fail = false;
  const { repo, time } = await fixture(t, { afterRun(sql) { if (fail && sql.includes('UPDATE running_sessions')) throw new Error('disk full'); } });
  const run = await repo.start(); time(10); fail = true;
  await assert.rejects(repo.append([fix(0), fix(5), fix(10)]));
  assert.deepEqual(await repo.points(run.id), []); assert.equal((await repo.get(run.id)).pointCount, 0);
  fail = false; await repo.append([fix(0), fix(5), fix(10)]); assert.equal((await repo.get(run.id)).pointCount, 3);
});
test('only one unfinished session can exist and deleting a completed session cascades only its own points', async t => {
  const { repo, db, time } = await fixture(t); const first = await repo.start();
  await assert.rejects(repo.start()); await assert.rejects(repo.remove(first.id));
  time(5); await repo.append([fix(0), fix(5)]); await repo.transition(first.id, 'completed');
  time(10); const second = await repo.start(); time(15); await repo.append([fix(10), fix(15)]);
  await assert.rejects(db.runAsync("INSERT INTO running_sessions(id,status,started_at,checkpoint_at,resumed_at) VALUES(?,'paused',1,1,1)", 'f'.repeat(32)));
  await repo.remove(first.id); assert.equal((await repo.points(second.id)).length, 2); assert.equal((await repo.list()).length, 1);
});
test('v2 migration preserves existing courses and notes; GPS data survives file close/reopen', async t => {
  const root = path.resolve('.cache/running-tests'); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(path.join(root, 'case-')); const filename = path.join(directory, 'run.db');
  let db = openSqlite(filename);
  t.after(async () => { await db.closeAsync(); assert.ok(directory.startsWith(root + path.sep)); rmSync(directory, { recursive: true }); });
  await migrateDatabase(db, migrations.slice(0, 2));
  await db.runAsync("INSERT INTO storage_test_notes(content,created_at,updated_at) VALUES('보존',1,1)");
  await db.runAsync(`INSERT INTO saved_courses VALUES(?, '기존 코스', 'osm', 'heart', 3, 3, 90, '{}', ?, 1, 1)`, 'c'.repeat(32), 'a'.repeat(64));
  const courses = await db.getAllAsync('SELECT * FROM saved_courses'); await migrateDatabase(db);
  const repo = createRunRepository(db, () => BASE); const run = await repo.start(); await repo.append([fix(0)]);
  await db.closeAsync(); db = openSqlite(filename); await migrateDatabase(db);
  const restored = createRunRepository(db, () => BASE + 999000);
  assert.equal((await restored.active()).id, run.id); assert.equal((await restored.points(run.id)).length, 1);
  assert.equal((await restored.transition(run.id, 'interrupted')).activeMs, 0);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM saved_courses'), courses);
  assert.equal((await db.getFirstAsync('SELECT content FROM storage_test_notes')).content, '보존');
});
test('serialized concurrent commands preserve every point and reject invalid IDs and pagination', async t => {
  const { repo, time } = await fixture(t); const run = await repo.start(); time(10);
  await Promise.all([repo.append([fix(0), fix(5)]), repo.append([fix(10)]), repo.transition(run.id, 'paused')]);
  assert.equal((await repo.get(run.id)).pointCount, 3);
  for (const id of ['', "';DELETE", 'g'.repeat(32)]) await assert.rejects(repo.get(id));
  await assert.rejects(repo.list(101)); await assert.rejects(repo.list(1, -1));
});
test('display duration and pace have stable units and haversine handles the date line', () => {
  assert.equal(durationLabel(3661000), '01:01:01'); assert.equal(paceLabel(300000, 1000), '5:00 /km');
  assert.equal(paceLabel(2000, 0), '—');
  assert.ok(distanceMeters({ latitude: 0, longitude: 179.999 }, { latitude: 0, longitude: -179.999 }) < 223);
});
test('delete removes GPS points even on a connection with foreign keys disabled', async t => {
  const { repo, db, time } = await fixture(t); const run = await repo.start(); time(5);
  await repo.append([fix(0), fix(5)]); await repo.transition(run.id, 'completed');
  await db.execAsync('PRAGMA foreign_keys=OFF'); await repo.remove(run.id);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM running_points')).n, 0);
});
