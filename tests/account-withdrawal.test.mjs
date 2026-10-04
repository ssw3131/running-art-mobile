import test from 'node:test';
import assert from 'node:assert/strict';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase, migrations } from '../src/modules/storage/migrations.ts';
import { createWithdrawalRepository } from '../src/modules/account/withdrawal-repository.ts';
import { createWithdrawalController, WITHDRAWAL_KEY } from '../src/modules/account/withdrawal.ts';
import { createWithdrawalRemote } from '../src/modules/account/withdrawal-remote.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { createAccountRepository } from '../src/modules/account/repository.ts';
import { createSyncRepository } from '../src/modules/sync/repository.ts';
import { defaultAccountPreferences } from '../src/modules/account/model.ts';
import { createDeletionReceipts } from '../supabase/functions/delete-account/receipts.ts';
import { createDeletionHandler } from '../supabase/functions/delete-account/handler.ts';
import { createAuthController } from '../src/modules/auth/controller.ts';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const snapshot = { schemaVersion: 1, engineVersion: '0.2', source: 'osm', shape: 'heart', origin: { lat: 0, lng: 0 }, targetKm: 1, lengthKm: 1, score: 90, route: [[0, 0], [0.001, 0]], target: [[0, 0], [0.001, 0]] };
const content = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['owner_id', 'remote_version', 'dirty', 'mutation_id'].includes(key)));
async function fixture(t, options = {}) {
  const hooks = {}, db = openSqlite(':memory:', hooks); t.after(() => db.closeAsync());
  await migrateDatabase(db, options.v6 ? migrations.slice(0, 6) : migrations);
  let owner = A, now = 1_000_000, exists = true, files = options.files ?? 0;
  const scope = () => owner, secure = new Map(), calls = [], faults = {};
  const courses = createCourseRepository(db, () => now, scope), runs = createRunRepository(db, () => now, scope);
  const account = createAccountRepository(db, scope), repository = createWithdrawalRepository(db, scope, () => now), sync = createSyncRepository(db, scope);
  const backend = {
    user: async token => token === A && exists ? { id: A, anonymous: false } : null,
    accountExists: async id => { assert.equal(id, A); return exists; },
    begin: async id => { assert.equal(id, A); calls.push('server-begin'); },
    files: async () => Array.from({ length: Math.min(files, 100) }, (_, i) => `${A}/course/${i.toString(16).padStart(32, '0')}/${'a'.repeat(64)}.json`),
    remove: async paths => { files -= paths.length; },
    deleteUser: async () => { calls.push('delete'); exists = false; if (faults.lost) { owner = ''; throw new Error('Lost deletion response'); } },
  };
  const signer = createDeletionReceipts('ab'.repeat(32), 'https://fixture.invalid', () => now);
  const handle = createDeletionHandler(backend, signer);
  const remote = createWithdrawalRemote({ url: 'https://fixture.invalid', key: 'fixture-public',
    token: async expected => { assert.equal(owner, expected); return owner; },
    fetch: async (url, init) => {
      const body = JSON.parse(init.body); calls.push(body.action);
      if (body.action === 'delete') {
        assert.ok(secure.has(WITHDRAWAL_KEY), 'encrypted intent precedes destruction');
        assert.ok(await repository.state(A), 'SQLite journal precedes destruction');
      }
      if (faults.network) throw new Error('Secret network diagnostic');
      if (faults.response) return faults.response(body);
      return handle(new Request(url, init));
    },
  });
  const storage = {
    getItem: async key => { if (faults.read) throw new Error('Secure read failed'); return secure.get(key) ?? null; },
    setItem: async (key, value) => { if (faults.write) throw new Error('Secure write failed'); secure.set(key, value); if (faults.readAfterWrite) faults.read = true; },
    removeItem: async key => { if (faults.cleanup) throw new Error('Secure cleanup failed'); secure.delete(key); },
  };
  const controller = () => createWithdrawalController({ available: options.available !== false, storage, repository: async () => repository, remote,
    currentOwner: () => owner || null, exclusive: async work => work(), quiesceSync: async () => { calls.push('hold'); },
    clearSession: async deleted => { if (faults.logout) throw new Error('Session cleanup failed'); if (owner === deleted) owner = ''; }, now: () => now,
  });
  return { db, hooks, courses, runs, account, repository, sync, controller, secure, calls, faults, backend,
    owner: () => owner, setOwner: value => { owner = value; }, setTime: value => { now = value; }, exists: () => exists,
    seed: async () => {
      const result = {};
      for (const person of [A, B, '']) {
        owner = person;
        const course = await courses.save(snapshot, person === A ? '탈퇴 전 코스' : person ? '다른 계정' : '비로그인 코스');
        const saved = await db.getFirstAsync('SELECT snapshot_json,snapshot_hash FROM saved_courses WHERE id=?', course.id);
        const run = await runs.start();
        await db.runAsync('INSERT INTO running_points VALUES(?,1,0,1000,37,127,5)', run.id);
        await db.runAsync("UPDATE running_sessions SET status='completed',ended_at=2000,point_count=1,distance_m=12,active_ms=1000,course_id=?,course_name='보존할 코스',course_outcome='finished',course_snapshot_json=?,course_snapshot_hash=? WHERE id=?", course.id, saved.snapshot_json, saved.snapshot_hash, run.id);
        await account.savePreferences({ ...defaultAccountPreferences, theme: person === A ? 'dark' : 'light' });
        if (person) await db.runAsync('INSERT INTO sync_accounts VALUES(?,1,123)', person);
        result[person] = { course: await db.getFirstAsync('SELECT * FROM saved_courses WHERE id=?', course.id), run: await db.getFirstAsync('SELECT * FROM running_sessions WHERE id=?', run.id) };
      }
      await db.runAsync("INSERT INTO storage_test_notes(content,created_at,updated_at) VALUES('메모 보존',1,1)");
      owner = A; return result;
    },
  };
}

test('v7 migration keeps nonempty v6 records, GPS, preferences and sync metadata byte-for-byte', async t => {
  const f = await fixture(t, { v6: true }); await f.seed();
  const tables = (await f.db.getAllAsync("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map(r => r.name);
  const before = Object.fromEntries(await Promise.all(tables.map(async name => [name, await f.db.getAllAsync(`SELECT * FROM ${name}`)])));
  await migrateDatabase(f.db); await migrateDatabase(f.db);
  for (const name of tables) assert.deepEqual(await f.db.getAllAsync(`SELECT * FROM ${name}`), before[name]);
});

test('confirmed server deletion retains all course/run content and GPS as guests, preserving other owners and guest settings', async t => {
  const f = await fixture(t), original = await f.seed(), points = await f.db.getAllAsync('SELECT * FROM running_points');
  const c = f.controller(); await c.begin();
  assert.equal(c.getSnapshot().complete, true); assert.equal(f.exists(), false); assert.equal(f.owner(), '');
  for (const [person, values] of Object.entries(original)) for (const [kind, old] of Object.entries(values)) {
    const row = await f.db.getFirstAsync(`SELECT * FROM ${kind === 'course' ? 'saved_courses' : 'running_sessions'} WHERE id=?`, old.id);
    if (person === A) { assert.deepEqual(content(row), content(old)); assert.equal(row.owner_id, ''); assert.equal(row.remote_version, 0); assert.equal(row.dirty, 1); }
    else assert.deepEqual(row, old);
  }
  assert.deepEqual(await f.db.getAllAsync('SELECT * FROM running_points'), points);
  assert.equal((await f.account.preferences()).theme, 'light', 'previous guest preference wins');
  assert.equal((await f.db.getFirstAsync('SELECT preferences_json FROM account_preferences WHERE owner_id=?', A)).preferences_json.includes('dark'), true);
  assert.equal((await f.db.getFirstAsync('SELECT count(*) n FROM storage_test_notes')).n, 1);
  assert.equal(f.secure.size, 0); assert.equal((await f.courses.list()).length, 2);
  assert.equal((await f.courses.get(original[A].course.id)).name, '탈퇴 전 코스');
  assert.equal((await f.runs.get(original[A].run.id)).courseOutcome, 'finished');
  assert.deepEqual(await f.runs.points(original[A].run.id), points.filter(p => p.run_id === original[A].run.id).map(({ run_id, ...point }) => point));
  assert.equal((await f.runs.guidance(original[A].run.id)).course.id, original[A].course.id, 'retained course-linked run opens as a guest');
  const after = await f.db.getAllAsync('SELECT * FROM saved_courses'); await f.repository.retainAsGuest(A);
  assert.deepEqual(await f.db.getAllAsync('SELECT * FROM saved_courses'), after, 'retry is idempotent');
  f.setOwner(B); await f.sync.enable(B, false); assert.equal((await f.courses.list()).length, 1, 'no automatic guest claim');
});

test('former account preferences become guest defaults only when no guest settings exist', async t => {
  const f = await fixture(t); await f.account.savePreferences({ ...defaultAccountPreferences, theme: 'dark' });
  await f.controller().begin(); assert.equal((await f.account.preferences()).theme, 'dark');
});

test('an in-progress run prevents any destructive request and can finish before retry', async t => {
  const f = await fixture(t), run = await f.runs.start(), c = f.controller();
  await c.begin(); assert.match(c.getSnapshot().message, /러닝/); assert.equal(f.calls.includes('delete'), false); assert.equal(await f.repository.state(A), null);
  await f.runs.transition(run.id, 'completed'); await c.resume(); assert.equal(c.getSnapshot().complete, true);
});

test('pending deletion blocks late sync writes, manual enable and new running records', async t => {
  const f = await fixture(t); await f.seed(); await f.repository.begin(A);
  await assert.rejects(f.sync.enable(A, true), /탈퇴/);
  await assert.rejects(f.sync.acknowledge(A, { kind: 'course', id: 'a'.repeat(32), mutationId: 'b' }, { version: 9 }), /탈퇴/);
  await assert.rejects(f.runs.start(), /withdrawal/);
  await assert.rejects(f.courses.save({ ...snapshot, score: 80 }, '늦게 저장'), /withdrawal/);
  assert.equal((await f.sync.status(A)).enabled, false);
  f.setOwner(B); await f.sync.enable(B, false); assert.equal((await f.sync.status(B)).enabled, true);
});

test('SQLite failure rolls all retention changes back and later retry keeps every row', async t => {
  const f = await fixture(t); await f.seed(); const before = await f.db.getAllAsync('SELECT * FROM saved_courses');
  let fail = true; f.hooks.afterRun = sql => { if (fail && sql.startsWith('UPDATE running_sessions SET owner_id')) throw new Error('Disk full'); };
  const c = f.controller(); await c.begin(); assert.equal(f.exists(), false); assert.equal(c.getSnapshot().complete, false);
  assert.deepEqual(await f.db.getAllAsync('SELECT * FROM saved_courses'), before); assert.ok(f.secure.has(WITHDRAWAL_KEY));
  fail = false; f.setOwner(''); await c.resume(); assert.equal(c.getSnapshot().complete, true);
});

test('response loss and session expiry recover via signed status after process recreation', async t => {
  const f = await fixture(t); await f.seed(); f.faults.lost = true;
  await f.controller().begin(); assert.equal(f.exists(), false); assert.equal(f.owner(), '');
  const before = await f.db.getAllAsync('SELECT * FROM saved_courses'); assert.ok(before.some(row => row.owner_id === A));
  const c = f.controller(); await c.start(); assert.equal(c.getSnapshot().pending, true); await c.resume();
  assert.equal(c.getSnapshot().complete, true); assert.equal(f.calls.filter(call => call === 'delete').length, 2, 'request plus backend deletion occur only once');
});

test('no server deletion if SecureStore write or read-back fails; reload prevents replacing the intent', async t => {
  for (const failure of ['write', 'readAfterWrite']) {
    const f = await fixture(t); f.faults[failure] = true; const c = f.controller(); await c.begin();
    assert.equal(f.exists(), true); assert.equal(f.calls.includes('delete'), false);
    f.faults[failure] = false; f.faults.read = false;
    if (failure === 'readAfterWrite') { f.setOwner(B); await c.begin(); assert.match(c.getSnapshot().message, /기존 탈퇴/); assert.equal(JSON.parse(f.secure.get(WITHDRAWAL_KEY)).owner, A); }
  }
});

test('large deletion returns pending and continues without repeating preparation or dropping local files', async t => {
  const f = await fixture(t, { files: 605 }); await f.seed(); const c = f.controller();
  await c.begin(); assert.equal(c.getSnapshot().pending, true); assert.equal(c.getSnapshot().complete, false);
  assert.equal((await f.db.getFirstAsync('SELECT count(*) n FROM saved_courses WHERE owner_id=?', A)).n, 1);
  await c.resume(); assert.equal(c.getSnapshot().complete, true); assert.equal(f.calls.filter(v => v === 'prepare').length, 1);
});

test('network outage, 401 and unrelated 404 never count as deletion or remove local data', async t => {
  for (const status of [401, 404, 503]) {
    const f = await fixture(t, { files: 605 }); await f.seed(); const c = f.controller(); await c.begin();
    const original = await f.db.getAllAsync('SELECT * FROM saved_courses');
    f.faults.response = () => Response.json({ state: 'deleted' }, { status }); await c.resume();
    assert.equal(c.getSnapshot().complete, false); assert.deepEqual(await f.db.getAllAsync('SELECT * FROM saved_courses'), original); assert.ok(f.secure.has(WITHDRAWAL_KEY));
  }
});

test('another logged-in account cannot continue deletion, but confirmed recovery never signs it out', async t => {
  const f = await fixture(t, { files: 605 }); await f.seed(); const c = f.controller(); await c.begin();
  f.setOwner(B); await c.resume(); assert.match(c.getSnapshot().message, /요청한 계정/); assert.equal(f.exists(), true);
  await f.backend.deleteUser(); await c.resume(); assert.equal(c.getSnapshot().complete, true); assert.equal(f.owner(), B);
  assert.equal((await f.courses.list()).length, 1);
});

test('expired receipt without a live account keeps data and never guesses completion', async t => {
  const f = await fixture(t); await f.seed(); f.faults.lost = true; await f.controller().begin();
  f.setTime(100_000_000); const c = f.controller(); await c.resume();
  assert.equal(c.getSnapshot().complete, false); assert.match(c.getSnapshot().message, /기간/);
  assert.equal((await f.db.getFirstAsync('SELECT count(*) n FROM saved_courses WHERE owner_id=?', A)).n, 1);
});

test('same live account renews an expired receipt and persists it before continuing', async t => {
  const f = await fixture(t, { files: 605 }), c = f.controller(); await c.begin();
  const old = f.secure.get(WITHDRAWAL_KEY); f.setTime(100_000_000); await c.resume();
  assert.equal(c.getSnapshot().complete, true); assert.equal(f.calls.filter(v => v === 'prepare').length, 2); assert.ok(old);
});

test('session/secure cleanup retries use durable retained state even after receipt expiry', async t => {
  for (const failure of ['logout', 'cleanup']) {
    const f = await fixture(t); await f.seed(); f.faults[failure] = true; await f.controller().begin();
    const before = await f.db.getAllAsync('SELECT * FROM saved_courses'); assert.ok((await f.repository.state(A)).retained_at);
    f.faults[failure] = false; f.setTime(100_000_000); f.faults.network = true;
    const c = f.controller(); await c.resume(); assert.equal(c.getSnapshot().complete, true); assert.deepEqual(await f.db.getAllAsync('SELECT * FROM saved_courses'), before);
  }
});

test('missing local intent/marker and malformed secure state cannot transfer someone else’s data', async t => {
  const f = await fixture(t); await f.seed(); await assert.rejects(f.repository.retainAsGuest(A), /요청/);
  for (const raw of ['bad json', '{}', JSON.stringify({ version: 1, owner: B })]) {
    f.secure.set(WITHDRAWAL_KEY, raw); const c = f.controller(); await c.begin(); assert.equal(c.getSnapshot().ready, false);
  }
  assert.equal(f.calls.includes('delete'), false); assert.equal((await f.db.getFirstAsync('SELECT count(*) n FROM saved_courses WHERE owner_id=?', A)).n, 1);
});

test('disabled rollout cannot prepare or delete accounts', async t => {
  const f = await fixture(t, { available: false }), c = f.controller(); await c.begin();
  assert.equal(f.calls.includes('prepare'), false); assert.equal(f.secure.size, 0); assert.equal(f.exists(), true);
});

test('auth account operation serializes profile/logout and only clears the deleted account session', async () => {
  let session = { user: { id: A, user_metadata: {} } }, listener, releases, logouts = 0, profiles = 0;
  const gate = new Promise(resolve => { releases = resolve; });
  const auth = { getSession: async () => ({ data: { session }, error: null }), onAuthStateChange: cb => { listener = cb; },
    signOut: async () => { logouts++; session = null; listener('SIGNED_OUT', null); return { error: null }; }, updateUser: async () => { profiles++; throw new Error('Must not run'); } };
  const controller = createAuthController({ auth, storage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }, openBrowser: async () => ({ type: 'cancel' }) });
  await controller.start(); const work = controller.withAccountOperation(async () => gate);
  await controller.handleUrl('runningart://auth/callback?code=late-code');
  assert.equal(controller.getSnapshot().busy, true, 'late callback cannot release withdrawal lock');
  await controller.signOut(); await controller.saveProfile({ nickname: '새 이름', picture: 'initials' });
  assert.equal(profiles, 0); assert.equal(logouts, 0); releases(); await work;
  session = { user: { id: B, user_metadata: {} } }; listener('SIGNED_IN', session);
  await controller.clearDeletedSession(A); assert.equal(controller.getSnapshot().account.id, B); assert.equal(logouts, 0);
  await controller.clearDeletedSession(B); assert.equal(controller.getSnapshot().account, null); assert.equal(logouts, 1);
});
