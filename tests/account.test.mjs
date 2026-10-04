import assert from 'node:assert/strict';
import test from 'node:test';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase, migrations } from '../src/modules/storage/migrations.ts';
import { createAccountRepository } from '../src/modules/account/repository.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { defaultAccountPreferences, validateProfile, profileImageUrl } from '../src/modules/account/model.ts';
import { createAuthController } from '../src/modules/auth/controller.ts';
import { demoCourse } from '../src/modules/guidance/simulator.ts';
import { createGuidance } from '../src/modules/guidance/engine.ts';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const route = demoCourse('normal');
const snapshot = { schemaVersion: 1, engineVersion: '0.2', source: 'osm', shape: 'heart', origin: { lat: route[0][1], lng: route[0][0] }, targetKm: 3, lengthKm: 3, score: 80, route, target: route };
const changed = { theme: 'dark', guidance: { voice: false, background: false, mode: 'focus' } };
async function fixture(t, hooks = {}) {
  const db = openSqlite(':memory:', hooks); t.after(() => db.closeAsync()); await migrateDatabase(db);
  let owner = A;
  const scope = () => owner;
  return { db, scope, setOwner: value => { owner = value; }, account: createAccountRepository(db, scope), courses: createCourseRepository(db, () => 1000, scope), runs: createRunRepository(db, () => 1000, scope) };
}

test('v6 preserves every v5 row including sync state and running guidance', async t => {
  const db = openSqlite(); t.after(() => db.closeAsync()); await migrateDatabase(db, migrations.slice(0, 5));
  await db.runAsync("INSERT INTO storage_test_notes(content,created_at,updated_at) VALUES('보존',1,1)");
  await createCourseRepository(db, () => 1000, () => A).save(snapshot, '기존 코스');
  const original = await db.getFirstAsync('SELECT * FROM saved_courses');
  const run = await createRunRepository(db, () => 1000, () => A).start();
  await db.runAsync('INSERT INTO running_points VALUES(?,1,0,1000,37,127,5)', run.id);
  await db.runAsync("UPDATE running_sessions SET status='completed',point_count=1,ended_at=2000,distance_m=12,active_ms=1000,course_id=?,course_name=?,course_outcome='finished',course_snapshot_json=?,course_snapshot_hash=?,guidance_json=?,guidance_options_json=? WHERE id=?",
    original.id, original.name, original.snapshot_json, original.snapshot_hash, JSON.stringify(createGuidance(route).checkpoint()), JSON.stringify(defaultAccountPreferences.guidance), run.id);
  await db.runAsync("INSERT INTO sync_accounts VALUES(?,1,123)", A);
  const tables = (await db.getAllAsync("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map(row => row.name);
  const before = {};
  for (const table of tables) before[table] = await db.getAllAsync(`SELECT * FROM ${table}`);
  await migrateDatabase(db); await migrateDatabase(db);
  for (const table of tables) assert.deepEqual(await db.getAllAsync(`SELECT * FROM ${table}`), before[table]);
  assert.equal((await db.getFirstAsync('SELECT count(*) n FROM account_preferences')).n, 0);
});

test('offline preferences persist and remain separated between guests and two accounts', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.account.preferences(), defaultAccountPreferences);
  await f.account.savePreferences(changed);
  assert.deepEqual(await createAccountRepository(f.db, f.scope).preferences(), changed);
  for (const owner of ['', B]) { f.setOwner(owner); assert.deepEqual(await f.account.preferences(), defaultAccountPreferences); }
  f.setOwner(A); assert.deepEqual(await f.account.preferences(), changed);
  assert.throws(() => f.account.savePreferences({ ...changed, theme: 'arbitrary' }));
  assert.deepEqual(await f.account.preferences(), changed);
});

test('a settings write rolls back if the account changes while SQLite is writing', async t => {
  let f, switchAccount = false;
  f = await fixture(t, { afterRun: sql => { if (switchAccount && sql.startsWith('INSERT INTO account_preferences')) f.setOwner(B); } });
  switchAccount = true;
  await assert.rejects(f.account.savePreferences(changed), /계정/);
  assert.equal((await f.db.getFirstAsync('SELECT count(*) n FROM account_preferences')).n, 0);
});

test('statistics include only owned completed runs and confirmed course finishes', async t => {
  const f = await fixture(t);
  await f.courses.save(snapshot, 'A 코스');
  for (const [id, owner, status, outcome, distance, duration] of [
    ['a', A, 'completed', 'finished', 3200, 1200000], ['b', A, 'completed', 'stopped', 700, 300000],
    ['c', A, 'paused', 'active', 900, 100000], ['d', B, 'completed', 'finished', 99999, 999999],
  ]) await f.db.runAsync('INSERT INTO running_sessions(id,owner_id,status,course_outcome,distance_m,active_ms,started_at,checkpoint_at,resumed_at) VALUES(?,?,?,?,?,?,1,1,1)', id.repeat(32), owner, status, outcome, distance, duration);
  assert.deepEqual(await f.account.statistics(), { courses: 1, runs: 2, finishedCourses: 1, distanceM: 3900, activeMs: 1500000 });
  f.setOwner(''); assert.deepEqual(await f.account.statistics(), { courses: 0, runs: 0, finishedCourses: 0, distanceM: 0, activeMs: 0 });
});

test('new course runs use account defaults while existing runs keep their own options', async t => {
  const f = await fixture(t), course = await f.courses.save(snapshot, '안내 설정');
  await f.account.savePreferences(changed);
  const run = await f.runs.start(course.id, { timestamp: 1000, latitude: route[0][1], longitude: route[0][0], accuracy: 5 });
  assert.deepEqual((await f.runs.guidance(run.id)).options, changed.guidance);
  await f.account.savePreferences(defaultAccountPreferences);
  assert.deepEqual((await f.runs.guidance(run.id)).options, changed.guidance);
});

test('profile validation uses Korean normalization, code points, control rejection and HTTPS images', () => {
  assert.deepEqual(validateProfile({ nickname: ' 러너 🏃 ', picture: 'initials' }), { nickname: '러너 🏃', picture: 'initials' });
  assert.equal(validateProfile({ nickname: '\u1100\u1161', picture: 'provider' }).nickname, '가');
  for (const nickname of ['', '  ', 'x'.repeat(21), 'a\nb', 'a\u202Eb']) assert.throws(() => validateProfile({ nickname, picture: 'provider' }));
  assert.equal(profileImageUrl('https://example.test/photo.png'), 'https://example.test/photo.png');
  for (const url of ['http://example.test/p', 'data:image/png;test', 'https://user:password@example.test/p', null]) assert.equal(profileImageUrl(url), null);
});

function authFixture(options = {}) {
  let session = { user: { id: A, email: 'test@example.test', user_metadata: { full_name: '원래 이름', picture: 'https://example.test/photo.png', unrelated: 'keep' }, identities: [{ provider: 'google' }] } };
  let listener, updates = 0, logout = 0;
  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: callback => { listener = callback; },
    updateUser: async ({ data }) => {
      updates++;
      if (options.gate) await options.gate;
      if (options.fail) return { data: { user: null }, error: new Error('private server token') };
      session = { ...session, user: { ...session.user, user_metadata: { ...session.user.user_metadata, ...data } } };
      listener('USER_UPDATED', session);
      return { data: { user: session.user }, error: null };
    },
    signOut: async () => { logout++; session = null; return { error: null }; },
  };
  const controller = createAuthController({ auth, storage: { getItem: async () => null, removeItem: async () => {} }, openBrowser: async () => ({ type: 'cancel' }) });
  return { controller, session: () => session, calls: () => ({ updates, logout }), expire: () => { session = null; listener('SIGNED_OUT', null); } };
}

test('profile saves only RunPen metadata, survives controller restart and uses connected identity', async () => {
  const f = authFixture(); await f.controller.start();
  assert.deepEqual(f.controller.getSnapshot().account.providers, ['google']);
  assert.equal(await f.controller.saveProfile({ nickname: '새 러너', picture: 'initials' }), true);
  assert.equal(f.controller.getSnapshot().account.name, '새 러너');
  assert.equal(f.session().user.user_metadata.full_name, '원래 이름');
  assert.equal(f.session().user.user_metadata.unrelated, 'keep');
  const restarted = createAuthController({ auth: { getSession: async () => ({ data: { session: f.session() } }), onAuthStateChange: () => {} }, storage: {}, openBrowser: async () => ({ type: 'cancel' }) });
  await restarted.start(); assert.deepEqual(restarted.getSnapshot().account, f.controller.getSnapshot().account);
});

test('invalid and offline profile changes keep the original profile without exposing errors', async () => {
  const f = authFixture({ fail: true }); await f.controller.start();
  assert.equal(await f.controller.saveProfile({ nickname: '', picture: 'provider' }), false);
  assert.equal(f.calls().updates, 0);
  assert.equal(await f.controller.saveProfile({ nickname: '변경', picture: 'provider' }), false);
  assert.equal(f.controller.getSnapshot().account.name, '원래 이름');
  assert.doesNotMatch(f.controller.getSnapshot().message, /private|token/);
});

test('profile mutation serializes logout and refuses a duplicate save', async () => {
  let resolve; const gate = new Promise(r => { resolve = r; });
  const f = authFixture({ gate }); await f.controller.start();
  const first = f.controller.saveProfile({ nickname: '변경', picture: 'provider' });
  await f.controller.signOut();
  assert.equal(await f.controller.saveProfile({ nickname: '중복', picture: 'provider' }), false);
  assert.deepEqual(f.calls(), { updates: 1, logout: 0 });
  resolve(); assert.equal(await first, true);
});
