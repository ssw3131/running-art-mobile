import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase, migrations, SCHEMA_VERSION } from '../src/modules/storage/migrations.ts';
import { createStorageClient } from '../src/modules/storage/client.ts';
import { createTestNoteRepository } from '../src/modules/storage/test-notes.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { COURSE_POINTS_MAX, encodeSnapshot, decodeSnapshot, savedCourseOverlay, courseErrorMessage } from '../src/modules/courses/model.ts';
import { courseFromCalculation } from '../src/features/route-lab/saved-course.ts';
import { createLabSession } from '../src/features/route-lab/session.ts';
import { candidateOverlay } from '../src/modules/route-engine/geojson.ts';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const reference = read('tests/fixtures/route-engine/grid-heart-v02.json');
const grid = read('assets/route-lab/grid.json');
function calculation(fixture = reference, liveRoads = false) {
  const input = fixture.fixture === 'grid' ? grid : read('assets/route-lab/seoul.json');
  return { origin: input.origin, options: fixture.options, liveRoads, result: fixture.result };
}
const snapshot = () => courseFromCalculation(calculation(), 0);
async function fixture(t, now = () => 1000, hooks) {
  const db = openSqlite(':memory:', hooks); t.after(() => db.closeAsync()); await migrateDatabase(db);
  return { db, repository: createCourseRepository(db, now) };
}

test('version 1 notes upgrade to courses without changing notes; shared client initializes once', async t => {
  const db = openSqlite(); t.after(() => db.closeAsync());
  await migrateDatabase(db, migrations.slice(0, 1));
  const notes = createTestNoteRepository(db, () => 123); await notes.create('남겨둘 메모'); const before = await notes.list();
  let opens = 0; const storage = createStorageClient(async () => { opens++; return db; });
  const [first, second] = await Promise.all([storage(), storage()]);
  assert.equal(opens, 1); assert.equal(first, second); assert.deepEqual(await first.list(), before);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, SCHEMA_VERSION);
  assert.deepEqual(await first.courses.list(), []);
  await first.courses.save(snapshot(), '코스'); assert.deepEqual(await first.list(), before);
});

test('all saved v0.2 reference candidates restore exact route, target, origin and unrounded distance', async t => {
  const { repository } = await fixture(t);
  let count = 0;
  for (const filename of fs.readdirSync('tests/fixtures/route-engine').filter(name => name.endsWith('-v02.json'))) {
    const data = read(`tests/fixtures/route-engine/${filename}`), completed = calculation(data, data.fixture === 'seoul');
    for (let index = 0; index < data.result.candidates.length; index++) {
      const value = courseFromCalculation(completed, index), saved = await repository.save(value, `후보 ${++count}`);
      const loaded = await repository.get(saved.id);
      assert.deepEqual(loaded.snapshot, value);
      assert.deepEqual(savedCourseOverlay(loaded.snapshot), { ...candidateOverlay(data.result.candidates[index], completed.origin), freeStart: true });
      assert.equal(loaded.lengthKm, data.result.candidates[index].score.lengthKm);
      assert.equal(loaded.source, data.fixture === 'seoul' ? 'osm' : 'synthetic');
    }
  }
  assert.equal(count, 25); assert.equal((await repository.list(100)).length, count);
});

test('save snapshots caller-owned data before awaits and duplicate requests preserve name and ID', async t => {
  const { repository } = await fixture(t);
  const value = snapshot(), expected = structuredClone(value);
  const saving = repository.save(value, '  첫 코스  ');
  value.route[0][0] = 0; value.origin.lat = 0; value.targetKm = 7;
  const first = await saving;
  assert.equal(first.created, true); assert.match(first.id, /^[a-f0-9]{32}$/);
  assert.deepEqual((await repository.get(first.id)).snapshot, expected);
  const [a, b] = await Promise.all([repository.save(expected, '다른 이름'), repository.save(expected, '또 다른 이름')]);
  assert.deepEqual(a, { id: first.id, created: false }); assert.deepEqual(b, a);
  assert.equal((await repository.get(first.id)).name, '첫 코스');
  assert.equal((await repository.list()).length, 1);
});

test('renaming binds quoted text and changes only name; delete is scoped and missing IDs fail', async t => {
  let time = 1000; const { repository } = await fixture(t, () => time);
  const first = await repository.save(snapshot(), '첫 코스');
  const next = await repository.save(courseFromCalculation(calculation(), 1), '두 번째');
  const before = await repository.get(first.id); time = 2000;
  const title = "한강 🏃 '); DROP TABLE saved_courses; --";
  await repository.rename(first.id, title);
  const after = await repository.get(first.id);
  assert.deepEqual(after.snapshot, before.snapshot); assert.equal(after.name, title);
  assert.equal(after.createdAt, 1000); assert.equal(after.updatedAt, 2000);
  await repository.remove(first.id);
  assert.equal((await repository.list())[0].id, next.id);
  await assert.rejects(repository.get(first.id), { code: 'missing' });
  await assert.rejects(repository.rename(first.id, '없음'), { code: 'missing' });
  await assert.rejects(repository.remove(first.id), { code: 'missing' });
});

test('pagination orders ties deterministically and does not load snapshot payloads', async t => {
  const { repository } = await fixture(t);
  for (let i = 0; i < 5; i++) await repository.save(courseFromCalculation(calculation(), i), `코스 ${i}`);
  const all = await repository.list(); const first = await repository.list(2), second = await repository.list(3, 2);
  assert.deepEqual([...first, ...second], all); assert.equal('snapshot' in first[0], false);
  assert.deepEqual(all.map(row => row.id), all.map(row => row.id).sort().reverse());
  await assert.rejects(repository.list(0), { code: 'validation' });
  await assert.rejects(repository.list(2, -1), { code: 'validation' });
});

test('invalid names, formats, coordinates, candidates and excessive point counts write nothing', async t => {
  const { repository } = await fixture(t);
  for (const name of ['', '  ', 'x'.repeat(81), 'a\0b', 'a\nb']) await assert.rejects(repository.save(snapshot(), name), { code: 'validation' });
  for (const change of [v => { v.route[0][0] = NaN; }, v => { v.origin.lat = 90; }, v => { v.shape = '__proto__'; },
    v => { v.targetKm = 0; }, v => { v.score = Infinity; }, v => { v.route = []; },
    v => { v.route = Array(COURSE_POINTS_MAX + 1).fill([127, 37]); }, v => { v.source = 'unknown'; }]) {
    const value = snapshot(); change(value); await assert.rejects(repository.save(value, '실패'), { code: 'validation' });
  }
  await assert.rejects(repository.save({ ...snapshot(), schemaVersion: 4 }, '미래'), { code: 'newer-format' });
  assert.throws(() => courseFromCalculation(calculation(), -1), { code: 'validation' });
  assert.throws(() => courseFromCalculation({ ...calculation(), result: { candidates: [] } }, 0), { code: 'validation' });
  assert.deepEqual(await repository.list(), []);
});

test('hash mismatch, malformed data and mismatched summary are isolated; damaged course remains deletable', async t => {
  const { repository, db } = await fixture(t);
  const a = await repository.save(snapshot(), '손상 대상'), b = await repository.save(courseFromCalculation(calculation(), 1), '정상');
  await db.runAsync('UPDATE saved_courses SET snapshot_json=? WHERE id=?', '{broken', a.id);
  await assert.rejects(repository.get(a.id), { code: 'corrupt' });
  await assert.rejects(repository.save(snapshot(), '손상을 숨기지 않음'), { code: 'corrupt' });
  assert.equal((await repository.list()).length, 2); assert.equal((await repository.get(b.id)).name, '정상');
  await repository.remove(a.id);
  await db.runAsync('UPDATE saved_courses SET length_km=1 WHERE id=?', b.id);
  await assert.rejects(repository.get(b.id), { code: 'corrupt' });
  await repository.remove(b.id); assert.deepEqual(await repository.list(), []);
  const data = encodeSnapshot(snapshot()); assert.throws(() => decodeSnapshot(data.json + ' ', data.hash), { code: 'corrupt' });
  assert.doesNotMatch(courseErrorMessage(new Error('private SQL payload')), /private SQL/);
});

test('failure after course insert rolls back and permits retry without a ghost saved item', async t => {
  let fail = true;
  const { repository, db } = await fixture(t, () => 1000, { afterRun: sql => {
    if (fail && sql.startsWith('INSERT INTO saved_courses')) throw new Error('simulated disk full');
  } });
  await createTestNoteRepository(db).create('보존');
  await assert.rejects(repository.save(snapshot(), '실패'), /disk full/);
  assert.deepEqual(await repository.list(), []); assert.equal((await createTestNoteRepository(db).list()).length, 1);
  fail = false; assert.equal((await repository.save(snapshot(), '재시도')).created, true);
});

test('completed calculation keeps original search metadata when next search inputs change', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const value = { origin: { ...grid.origin }, options: { ...reference.options }, elements: [] };
  const request = { input: value, liveRoads: true }; let completed;
  const session = createLabSession(async () => { await gate; return { elements: [], source: 'test', cached: false }; }, async () => ({ result: reference.result }));
  const job = session.start(request, { progress() {}, success(result) { completed = result; }, error(error) { throw error; } });
  value.origin.lat = 0; value.options.shape = 'star'; value.options.targetKm = 7; request.liveRoads = false; release(); await job;
  const saved = courseFromCalculation(completed, 0);
  assert.deepEqual(saved.origin, grid.origin); assert.equal(saved.shape, 'heart'); assert.equal(saved.targetKm, 5); assert.equal(saved.source, 'osm');
});

test('course update and deletion survive fresh process; uncommitted changes roll back', async t => {
  const root = path.resolve('.cache/course-tests'); fs.mkdirSync(root, { recursive: true });
  const folder = fs.mkdtempSync(path.join(root, 'restart-')), filename = path.join(folder, 'courses.db');
  t.after(() => { assert.ok(path.resolve(folder).startsWith(root + path.sep)); fs.rmSync(folder, { recursive: true, force: true }); });
  let db = openSqlite(filename); await migrateDatabase(db); let repository = createCourseRepository(db);
  const a = await repository.save(snapshot(), '재시작'), b = await repository.save(courseFromCalculation(calculation(), 1), '삭제');
  await repository.rename(a.id, '이름 보존'); await repository.remove(b.id);
  const before = await repository.get(a.id); await db.closeAsync();
  const child = spawnSync(process.execPath, ['--input-type=module', '-e',
    'import {DatabaseSync} from "node:sqlite"; const db=new DatabaseSync(process.argv[1]); db.exec("BEGIN IMMEDIATE; DELETE FROM saved_courses;"); process.exit(23);', filename]);
  assert.equal(child.status, 23, child.stderr.toString());
  db = openSqlite(filename); await migrateDatabase(db); repository = createCourseRepository(db);
  try { assert.deepEqual(await repository.get(a.id), before); await assert.rejects(repository.get(b.id), { code: 'missing' }); }
  finally { await db.closeAsync(); }
});
