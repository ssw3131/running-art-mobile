import test from 'node:test';
import assert from 'node:assert/strict';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase, migrations } from '../src/modules/storage/migrations.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { createRunController } from '../src/modules/running/controller.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { createSyncRepository } from '../src/modules/sync/repository.ts';
import { decodePayload, digest } from '../src/modules/sync/model.ts';
import { createGuidance } from '../src/modules/guidance/engine.ts';
import { createSimulator } from '../src/modules/guidance/simulator.ts';
import { startReadiness } from '../src/modules/running/guidance.ts';
import { offset } from '../src/modules/guidance/geometry.ts';

const BASE = 1800000000000, owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const route = [[0,0],[0,240],[240,240],[240,0],[0,0]].map(([x,y])=>offset([127,37],x,y));
const snap = { schemaVersion: 1, engineVersion: '0.2', source: 'osm', shape: 'heart', origin: { lat: route[0][1], lng: route[0][0] }, targetKm: 3, lengthKm: 3, score: 80, route, target: route };
const gps = (time, position = route[0], accuracy = 5) => ({ timestamp: BASE + time, latitude: position[1], longitude: position[0], accuracy });
async function fixture(t, options) {
  const db = openSqlite(':memory:', options); t.after(() => db.closeAsync()); await migrateDatabase(db);
  let clock = BASE;
  const runs = createRunRepository(db, () => clock, () => owner), courses = createCourseRepository(db, () => clock, () => owner);
  const course = await courses.save(snap, '정방향 QA 코스');
  return { db, runs, courses, course, time: ms => { clock = BASE + ms; }, sync: createSyncRepository(db, () => owner) };
}
async function complete(f) {
  const run = await f.runs.start(f.course.id, gps(0));
  const source = createSimulator(route, 'normal');
  let result;
  for (let i = 0; i < 3000; i++) {
    const sample = source.step(); f.time(source.elapsed());
    if (sample) result = await f.runs.append([gps(sample.timestamp, sample.position, sample.accuracy)]);
    if (result?.paused) return { run, result };
  }
  assert.fail('arrival not detected');
}
test('departure requires owned closed OSM geometry, fresh GPS and on-course or prepared access', async t => {
  const f = await fixture(t);
  await assert.rejects(f.runs.start(f.course.id));
  await assert.rejects(f.runs.start(f.course.id, gps(0, offset(route[0], -100, 0))));
  await assert.rejects(f.runs.start(f.course.id, gps(-6000)));
  await assert.rejects(f.runs.start(f.course.id, gps(0, route[0], 31)));
  assert.equal(await f.runs.active(), null);
  const synthetic = await f.courses.save({ ...snap, source: 'synthetic' }, '가상');
  await assert.rejects(f.runs.start(synthetic.id, gps(0)), /가상/);
  const other = createRunRepository(f.db, () => BASE, () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  await assert.rejects(other.start(f.course.id, gps(0)), /계정/);
  assert.equal(startReadiness({ id: f.course.id, name: '코스', snapshot: snap }, gps(0), BASE).ready, true);
});
test('real GPS follows the stored course, pauses on stationary arrival, and saves only after confirmation', async t => {
  const f = await fixture(t), { run, result } = await complete(f);
  const paused = await f.runs.get(run.id);
  assert.equal(paused.status, 'paused'); assert.equal(paused.courseOutcome, 'arrival-pending');
  assert.equal(result.events.at(-1).kind, 'arrival');
  const guide = await f.runs.guidance(run.id);
  assert.equal(guide.state.status, 'arrived');
  assert.ok(paused.pointCount < guide.checkpoint.lastInput / 1000, 'stationary fixes guide without bloating the GPS record');
  assert.equal((await f.sync.pending(owner)).filter(r => r.kind === 'run').length, 0);
  await f.runs.transition(run.id, 'completed');
  assert.equal((await f.runs.get(run.id)).courseOutcome, 'finished');
});
test('continue after arrival does not immediately stop again at the same point', async t => {
  const f = await fixture(t), { run } = await complete(f);
  const before = await f.runs.get(run.id), at = before.checkpointAt - BASE + 10000;
  f.time(at); await f.runs.transition(run.id, 'running');
  for (let i = 1; i <= 8; i++) { f.time(at + i * 1000); await f.runs.append([gps(at + i * 1000, route.at(-1))]); }
  assert.equal((await f.runs.get(run.id)).status, 'running');
  assert.equal((await f.runs.get(run.id)).courseOutcome, 'active');
  await f.runs.transition(run.id, 'completed');
  assert.equal((await f.runs.get(run.id)).courseOutcome, 'finished');
});
test('resume outside the last progress point never skips the intervening course', async t => {
  const f = await fixture(t), run = await f.runs.start(f.course.id, gps(0));
  const source = createSimulator(route, 'normal');
  for (let i = 0; i < 30; i++) { const sample = source.step(); f.time(sample.timestamp); await f.runs.append([gps(sample.timestamp, sample.position)]); }
  const before = await f.runs.guidance(run.id);
  await f.runs.transition(run.id, 'interrupted'); f.time(300000); await f.runs.transition(run.id, 'running');
  f.time(301000); await f.runs.append([gps(301000, route.at(-1))]);
  const after = await f.runs.guidance(run.id);
  assert.equal(after.state.progressM, before.state.progressM);
  assert.notEqual(after.state.status, 'arrived'); assert.deepEqual(after.state.returnPath, []);
});
test('checkpoint restores sequential matching and event de-duplication after every fix', () => {
  const source = createSimulator(route, 'detour'), original = createGuidance(route);
  let restored = createGuidance(route); original.ingest(source.sample()); restored.ingest(source.sample());
  for (let i = 0; i < 900; i++) {
    const fix = source.step(); if (!fix) continue;
    const a = original.ingest(fix), b = restored.ingest(fix);
    assert.equal(b.progressM, a.progressM); assert.equal(b.status, a.status);
    assert.deepEqual(restored.checkpoint(), original.checkpoint());
    const previousEvents = new Set(restored.checkpoint().emitted);
    restored = createGuidance(route, restored.checkpoint());
    assert.ok(restored.snapshot().events.every(e => !previousEvents.has(e.id)));
  }
});
test('failed GPS transaction preserves both record and guidance progress for retry', async t => {
  let fail = false;
  const f = await fixture(t, { afterRun(sql) { if (fail && sql.includes('SET guidance_json')) throw new Error('disk full'); } });
  const run = await f.runs.start(f.course.id, gps(0)), before = await f.runs.guidance(run.id);
  f.time(5000); fail = true;
  await assert.rejects(f.runs.append([gps(5000, offset(route[0], 5, 0))]));
  assert.equal((await f.runs.get(run.id)).pointCount, 0);
  assert.deepEqual((await f.runs.guidance(run.id)).checkpoint, before.checkpoint);
  fail = false; await f.runs.append([gps(5000, offset(route[0], 5, 0))]);
  assert.equal((await f.runs.get(run.id)).pointCount, 1);
});
test('course deletion retains the run snapshot and versioned payload restores in empty SQLite', async t => {
  const f = await fixture(t), { run } = await complete(f);
  await f.runs.transition(run.id, 'completed'); await f.courses.rename(f.course.id, '변경한 이름'); await f.courses.remove(f.course.id);
  const pending = (await f.sync.pending(owner)).find(r => r.kind === 'run');
  const hash = digest(pending.payload);
  const remote = { owner_id: owner, kind: 'run', record_id: run.id, version: 1, mutation_id: pending.mutationId, deleted: false,
    summary: pending.summary, payload_path: `${owner}/run/${run.id}/${hash}.json`, payload_hash: hash };
  const decoded = decodePayload(remote, pending.payload);
  assert.equal(decoded.course.name, '정방향 QA 코스'); assert.deepEqual(decoded.course.snapshot, snap);
  const db2 = openSqlite(); t.after(() => db2.closeAsync()); await migrateDatabase(db2);
  await createSyncRepository(db2, () => owner).restore(owner, remote, pending.payload);
  const restored = createRunRepository(db2, () => BASE, () => owner);
  assert.equal((await restored.get(run.id)).courseOutcome, 'finished');
  assert.deepEqual((await restored.guidance(run.id)).course, decoded.course);
  assert.deepEqual(await restored.points(run.id), await f.runs.points(run.id));
  const tampered = JSON.parse(pending.payload); tampered.course.id = 'b'.repeat(32);
  const content = JSON.stringify(tampered);
  assert.throws(() => decodePayload({ ...remote, payload_hash: digest(content) }, content));
});
test('v4 to v5 adds nullable guidance fields without touching existing GPS or course bytes', async t => {
  const db = openSqlite(); t.after(() => db.closeAsync()); await migrateDatabase(db, migrations.slice(0, 4));
  const id = 'c'.repeat(32);
  await createCourseRepository(db, () => BASE, () => owner).save(snap, '업그레이드 전 코스');
  await db.runAsync("INSERT INTO running_sessions(id,status,started_at,ended_at,active_ms,checkpoint_at,resumed_at,point_count,owner_id) VALUES(?,'completed',?,?,10000,?,?,2,?)", id, BASE, BASE + 10000, BASE + 10000, BASE, owner);
  for (let i = 0; i < 2; i++) await db.runAsync('INSERT INTO running_points(run_id,sequence,segment,timestamp,latitude,longitude,accuracy) VALUES(?,?,0,?,?,?,5)', id, i + 1, BASE + i * 10000, route[i][1], route[i][0]);
  await db.runAsync('INSERT INTO storage_test_notes(content,created_at,updated_at) VALUES(?,?,?)', '업그레이드 전 메모', BASE, BASE);
  const tables = ['running_sessions', 'running_points', 'saved_courses', 'storage_test_notes'];
  const old = await Promise.all(tables.map(table => db.getAllAsync(`SELECT * FROM ${table}`)));
  await migrateDatabase(db);
  for (let i = 0; i < tables.length; i++) {
    const columns = Object.keys(old[i][0]).join(',');
    assert.deepEqual(await db.getAllAsync(`SELECT ${columns} FROM ${tables[i]}`), old[i], tables[i]);
  }
  const current = await db.getFirstAsync('SELECT * FROM running_sessions');
  assert.equal(current.course_id, null); assert.equal(current.guidance_json, null);
  assert.equal(await createRunRepository(db, () => BASE, () => owner).guidance(id), null);
});

test('screen-off opt-out pauses the course, preserves progress, and a new process requires explicit resume', async t => {
  const f = await fixture(t);
  let foreground = true, tracking = false;
  const driver = { prepare: async () => {}, locate: async () => gps(0), start: async () => { tracking = true; },
    stop: async () => { tracking = false; }, healthy: async () => tracking, foreground: () => foreground };
  const controller = createRunController(async () => f.runs, driver);
  const run = await controller.start(f.course.id);
  f.time(1000); await controller.ingest([gps(1000)]);
  const before = await f.runs.guidance(run.id);
  await f.runs.setGuidanceOptions(run.id, { voice: false, background: false, mode: 'focus' });
  foreground = false; f.time(2000); await controller.monitor();
  assert.equal(tracking, false); assert.equal((await f.runs.get(run.id)).status, 'paused');
  foreground = true; await controller.monitor();
  assert.equal((await f.runs.get(run.id)).status, 'paused', 'returning to the app cannot silently resume');
  await controller.resume(run.id);
  assert.equal(tracking, true);
  const restarted = createRunController(async () => f.runs, driver);
  f.time(60000); await restarted.recover();
  assert.equal(tracking, false); assert.equal((await f.runs.get(run.id)).status, 'interrupted');
  assert.equal((await f.runs.guidance(run.id)).state.progressM, before.state.progressM);
  assert.deepEqual((await f.runs.guidance(run.id)).options, { voice: false, background: false, mode: 'focus' });
  assert.ok((await f.runs.get(run.id)).activeMs < 60000, 'process downtime is not recorded as activity');
});

test('a GPS gap cannot satisfy off-route or stationary arrival dwell time', () => {
  const origin = [127, 37], end = offset(origin, 100, 0);
  const off = createGuidance([origin, end]);
  for (let i = 0; i <= 4; i++) off.ingest({ position: offset(origin, 0, i * 10), timestamp: i * 1000, accuracy: 5 });
  for (let i = 10; i < 15; i++) {
    off.ingest({ position: offset(origin, 0, 40), timestamp: i * 1000, accuracy: 5 });
    assert.equal(off.checkpoint().off, false);
  }
  assert.equal(off.ingest({ position: offset(origin, 0, 40), timestamp: 15000, accuracy: 5 }).events.at(-1).kind, 'off-route');
  assert.deepEqual(off.snapshot().returnPath, [], 'the gap does not fabricate a continuous return path');
  const arrival = createGuidance([origin, end]);
  for (let i = 0; i <= 11; i++) arrival.ingest({ position: offset(origin, Math.min(100, i * 10), 0), timestamp: i * 1000, accuracy: 5 });
  for (let i = 20; i < 23; i++) assert.notEqual(arrival.ingest({ position: end, timestamp: i * 1000, accuracy: 5 }).status, 'arrived');
  assert.equal(arrival.ingest({ position: end, timestamp: 23000, accuracy: 5 }).status, 'arrived');
});
