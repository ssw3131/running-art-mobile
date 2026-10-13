import assert from 'node:assert/strict';
import test from 'node:test';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { createHomeRepository } from '../src/modules/home/repository.ts';
import { courseProgress, homeKind, homeMonth, homePathSvg } from '../src/modules/home/model.ts';
import { encodeSnapshot } from '../src/modules/courses/model.ts';
import { createGuidance } from '../src/modules/guidance/engine.ts';
import { demoCourse } from '../src/modules/guidance/simulator.ts';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date(2026, 9, 13, 12).getTime();
const id = n => n.toString(16).padStart(32, '0');
async function fixture(t) {
  const db = openSqlite(); t.after(() => db.closeAsync()); await migrateDatabase(db);
  let owner = A;
  return { db, home: createHomeRepository(db, () => owner), switchOwner: value => { owner = value; } };
}
async function run(db, n, { owner = A, status = 'completed', started = NOW, distance = 1000, ended = NOW + 10000 } = {}) {
  await db.runAsync('INSERT INTO running_sessions(id,status,started_at,ended_at,checkpoint_at,resumed_at,owner_id,distance_m,active_ms) VALUES(?,?,?,?,?,?,?,?,?)', id(n), status, started, status === 'completed' ? ended : null, started, started, owner, distance, 10000);
}

test('home distinguishes an empty account, saved history and every active status', async t => {
  const f = await fixture(t);
  assert.equal(homeKind(await f.home.read(NOW)), 'initial');
  await run(f.db, 1); assert.equal(homeKind(await f.home.read(NOW)), 'history');
  for (const status of ['running', 'paused', 'interrupted']) {
    await run(f.db, 2, { status });
    const state = await f.home.read(NOW);
    assert.equal(homeKind(state), 'active'); assert.equal(state.active.run.status, status);
    assert.equal(state.runCount, 1); assert.equal(state.monthlyDistanceM, 1000);
    assert.equal(state.active.progress, null);
    await f.db.runAsync('DELETE FROM running_sessions WHERE id=?', id(2));
  }
});

test('home calendar includes start boundary and excludes next month, active and other owner; no 30-row cap', async t => {
  const f = await fixture(t), month = homeMonth(NOW);
  await run(f.db, 1, { started: month.start - 1, ended: month.start + 10000, distance: 8000 });
  await run(f.db, 2, { started: month.start, distance: 2000 });
  await run(f.db, 3, { started: month.end - 1, distance: 3000 });
  await run(f.db, 4, { started: month.end, distance: 9000 });
  await run(f.db, 5, { owner: B, distance: 50000 });
  await run(f.db, 6, { status: 'paused', distance: 60000 });
  for (let n = 7; n <= 70; n++) await run(f.db, n, { distance: 10 });
  const state = await f.home.read(NOW);
  assert.equal(state.monthlyDistanceM, 5640); assert.equal(state.runCount, 68);
  assert.equal(state.recent.length, 3); assert.equal(state.recent[0].run.id, id(4));
  f.switchOwner(B); assert.equal((await f.home.read(NOW)).monthlyDistanceM, 50000);
  f.switchOwner(''); assert.equal(homeKind(await f.home.read(NOW)), 'initial');
});

test('home recent tie ordering, deletion and guest ownership reflect actual storage without writes', async t => {
  const f = await fixture(t);
  for (let n = 1; n <= 4; n++) await run(f.db, n);
  await run(f.db, 5, { owner: '' });
  const before = await f.db.getAllAsync('SELECT * FROM running_sessions ORDER BY id');
  assert.deepEqual((await f.home.read(NOW)).recent.map(item => item.run.id), [id(4), id(3), id(2)]);
  assert.deepEqual(await f.db.getAllAsync('SELECT * FROM running_sessions ORDER BY id'), before);
  await f.db.runAsync('DELETE FROM running_sessions WHERE id=?', id(4));
  assert.equal((await f.home.read(NOW)).runCount, 3);
  f.switchOwner(''); assert.deepEqual((await f.home.read(NOW)).recent.map(item => item.run.id), [id(5)]);
});

test('home rejects a queued read when the owner changes before its transaction', async t => {
  const f = await fixture(t);
  const pending = f.home.read(NOW); f.switchOwner(B);
  await assert.rejects(pending, /계정이 변경/);
  assert.equal((await f.home.read(NOW)).owner, B);
});

test('home preserves active recovery when guidance is corrupt; real GPS segments stay separate', async t => {
  const f = await fixture(t); await run(f.db, 1, { status: 'interrupted' });
  await f.db.runAsync('UPDATE running_sessions SET course_id=?,course_name=?,course_snapshot_json=?,course_snapshot_hash=?,point_count=4 WHERE id=?', id(9), '보존 코스', '{}', 'bad', id(1));
  for (let n = 1; n <= 4; n++) await f.db.runAsync('INSERT INTO running_points(run_id,sequence,segment,timestamp,latitude,longitude,accuracy) VALUES(?,?,?,?,?,?,?)', id(1), n, n < 3 ? 0 : 1, NOW + n, 37 + n / 1000, 127, 5);
  const active = (await f.home.read(NOW)).active;
  assert.equal(active.guidanceError, true); assert.equal(active.progress, null); assert.equal(active.run.status, 'interrupted');
  assert.deepEqual(active.paths.map(path => path.length), [2, 2]);
  const svg = decodeURIComponent(homePathSvg(active.paths, '#FC5602'));
  assert.equal((svg.match(/<polyline/g) ?? []).length, 2);
});

test('home uses guidance progress instead of walked distance, even if the saved course was deleted', async t => {
  const f = await fixture(t); await run(f.db, 1, { status: 'paused', distance: 99999 });
  const route = demoCourse('normal'), engine = createGuidance(route), cp = engine.checkpoint();
  cp.progress = engine.snapshot().totalM * .42;
  const course = encodeSnapshot({ schemaVersion: 1, engineVersion: '0.2', source: 'osm', shape: 'heart', origin: { lng: route[0][0], lat: route[0][1] }, targetKm: 3, lengthKm: 3, score: 80, route, target: route });
  await f.db.runAsync('UPDATE running_sessions SET course_id=?,course_name=?,course_snapshot_json=?,course_snapshot_hash=?,guidance_json=? WHERE id=?', id(9), '삭제된 원본의 러닝 사본', course.json, course.hash, JSON.stringify(cp), id(1));
  const active = (await f.home.read(NOW)).active;
  assert.equal(active.progress, 42); assert.equal(active.run.distanceM, 99999); assert.ok(active.paths[0].length > 1);
  assert.equal(active.guidanceError, false);
});

test('home month is calendar-safe in December and leap February; malformed progress is unavailable', () => {
  assert.deepEqual(homeMonth(new Date(2026, 11, 31).getTime()), { start: new Date(2026, 11, 1).getTime(), end: new Date(2027, 0, 1).getTime() });
  assert.equal(homeMonth(new Date(2028, 1, 29).getTime()).end, new Date(2028, 2, 1).getTime());
  assert.equal(courseProgress(150, 100), 100); assert.equal(courseProgress(-5, 100), 0);
  assert.equal(courseProgress(5, 0), null); assert.equal(courseProgress(NaN, 100), null);
  assert.equal(homePathSvg([], '#FC5602'), null);
  assert.ok(!homePathSvg([[[127, 37]]], '#FC5602').includes('NaN'));
});
