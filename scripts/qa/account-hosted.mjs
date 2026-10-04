// Explicit hosted integration test. Only dashboard-created @example.invalid
// fixtures in the ignored private file can be signed in to or deleted here.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { migrateDatabase } from '../../src/modules/storage/migrations.ts';
import { createCourseRepository } from '../../src/modules/courses/repository.ts';
import { createRunRepository } from '../../src/modules/running/repository.ts';
import { createSyncRepository } from '../../src/modules/sync/repository.ts';
import { createSyncRemote } from '../../src/modules/sync/remote.ts';
import { synchronize } from '../../src/modules/sync/engine.ts';
import { createWithdrawalRepository } from '../../src/modules/account/withdrawal-repository.ts';
import { createWithdrawalController, WITHDRAWAL_KEY } from '../../src/modules/account/withdrawal.ts';
import { createWithdrawalRemote } from '../../src/modules/account/withdrawal-remote.ts';

assert.equal(process.argv[2], '--run-disposable', 'Explicit disposable-account mode required');
const directory = new URL('../../.cache/account-hosted-qa/', import.meta.url);
const credentials = JSON.parse(await readFile(new URL('fixtures.private.json', directory), 'utf8'));
assert.equal(credentials.length, 2);
for (const value of credentials) assert.match(value.email, /^runpen-qa-\d+-[ab]@example\.invalid$/);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL, key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(new URL(url).hostname, 'zymfblgzpidgfjjgrino.supabase.co');
assert.ok(key);
const report = { startedAt: new Date().toISOString(), checks: [], scope: 'Hosted Auth/Storage/Postgres and production app controllers with isolated PC SQLite; no Android device' };
const pass = name => { report.checks.push(name); console.log(`PASS: ${name}`); };
let stage = 'fixture sign-in';
const clients = [], databases = [];
const safeFetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.any([AbortSignal.timeout(45000), ...(init?.signal ? [init.signal] : [])]) });
const clientFor = token => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: safeFetch, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) } });
const hash = text => createHash('sha256').update(text).digest('hex');
const snapshot = { schemaVersion: 1, engineVersion: '0.2', source: 'osm', shape: 'heart', origin: { lat: 0, lng: 0 }, targetKm: 1, lengthKm: 1, score: 90, route: [[0, 0], [0.001, 0]], target: [[0, 0], [0.001, 0]] };
const content = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['owner_id', 'remote_version', 'dirty', 'mutation_id'].includes(key)));
try {
  for (const credential of credentials) {
    const client = clientFor(), { data, error } = await client.auth.signInWithPassword(credential);
    assert.equal(error, null); assert.equal(data.user.email, credential.email);
    assert.ok(data.user.identities.every(identity => identity.provider === 'email'));
    clients.push({ client, owner: data.user.id, token: data.session.access_token });
  }
  assert.notEqual(clients[0].owner, clients[1].owner);
  const [a, b] = clients;
  const fixtures = [];
  stage = 'seed isolated SQLite and sync';
  for (let index = 0; index < clients.length; index++) {
    const account = clients[index], db = openSqlite(new URL(`fixture-${Date.now()}-${index}.sqlite`, directory).pathname.replace(/^\/(\w:)/, '$1'));
    databases.push(db); await migrateDatabase(db);
    let owner = account.owner, now = Date.now();
    const scope = () => owner, courses = createCourseRepository(db, () => now, scope), runs = createRunRepository(db, () => now, scope);
    const course = await courses.save(snapshot, `Hosted withdrawal QA ${index}`);
    const run = await runs.start();
    await runs.append([{ timestamp: now, latitude: 0, longitude: 0, accuracy: 5 }]);
    now += 5000;
    await runs.append([{ timestamp: now, latitude: 0, longitude: 0.0001, accuracy: 5 }]);
    now += 5000; await runs.transition(run.id, 'completed');
    const sync = createSyncRepository(db, scope), remote = createSyncRemote(account.client, owner);
    await sync.enable(owner, false);
    assert.equal((await synchronize({ owner, repository: sync, remote, check: () => {} })).uploaded, 2);
    const saved = await db.getAllAsync('SELECT * FROM saved_courses'), running = await db.getAllAsync('SELECT * FROM running_sessions'), points = await db.getAllAsync('SELECT * FROM running_points');
    assert.equal(points.length, 2);
    fixtures.push({ db, scope, courses, runs, sync, remote, course, run, saved, running, points, setOwner: value => { owner = value; } });
  }
  pass('real app synchronization uploaded two course/run records and GPS files per disposable account');
  const [local, other] = fixtures;
  const beforeB = await b.client.from('personal_records').select('*').order('record_id');
  assert.equal(beforeB.error, null); assert.equal(beforeB.data.length, 2);
  const aRows = await a.client.from('personal_records').select('*').order('record_id');
  assert.equal(aRows.error, null); assert.equal(aRows.data.length, 2);
  assert.equal((await b.client.storage.from('personal-records').download(aRows.data[0].payload_path)).data, null);
  pass('other-account private payload reads are denied');
  stage = 'multi-batch file fixtures';
  // 2 referenced payloads + 499 orphan payloads exercise the real 500-file boundary.
  const orphanPayload = '{}', orphanHash = hash(orphanPayload);
  const extraPaths = Array.from({ length: 499 }, () => `${a.owner}/course/${randomBytes(16).toString('hex')}/${orphanHash}.json`);
  for (let offset = 0; offset < extraPaths.length; offset += 20) {
    await Promise.all(extraPaths.slice(offset, offset + 20).map(path => local.remote.upload(path, orphanPayload)));
  }
  const secure = new Map(), storage = {
    getItem: async name => secure.get(name) ?? null,
    setItem: async (name, value) => { secure.set(name, value); await writeFile(new URL('withdrawal-intent.private.json', directory), value); },
    removeItem: async name => { secure.delete(name); await writeFile(new URL('withdrawal-intent.private.json', directory), 'null'); },
  };
  let fault = 'before-delete', deleteRequests = 0, lastReceipt;
  const responses = [];
  const remote = createWithdrawalRemote({ url, key, token: async owner => { assert.equal(owner, a.owner); return a.token; }, fetch: async (input, init) => {
    const body = JSON.parse(init.body);
    if (body.action === 'delete') {
      assert.ok(secure.has(WITHDRAWAL_KEY));
      if (fault === 'before-delete') { fault = ''; throw new Error('QA simulated request loss'); }
      deleteRequests++;
    }
    const response = await safeFetch(input, init);
    const value = await response.clone().json();
    responses.push({ action: body.action, status: response.status, state: value.state });
    if (body.action === 'prepare') lastReceipt = value.receipt;
    if (body.action === 'delete' && value.state === 'deleted' && fault === 'after-delete') { fault = ''; throw new Error('QA simulated response loss'); }
    return response;
  } });
  const repository = createWithdrawalRepository(local.db, local.scope);
  const controller = () => createWithdrawalController({ available: true, storage, repository: async () => repository, remote,
    currentOwner: () => local.scope() || null, exclusive: work => work(), quiesceSync: async () => {},
    clearSession: async owner => { assert.equal(owner, a.owner); local.setOwner(''); await a.client.auth.signOut({ scope: 'local' }); },
  });
  stage = 'prepare and request failure';
  let c = controller(); await c.begin();
  assert.equal(c.getSnapshot().pending, true); assert.equal(c.getSnapshot().complete, false); assert.equal(deleteRequests, 0);
  assert.deepEqual(await local.db.getAllAsync('SELECT * FROM saved_courses'), local.saved);
  const receiptB = await createWithdrawalRemote({ url, key, token: async () => b.token, fetch: safeFetch }).prepare(b.owner);
  const wrongOwner = await safeFetch(`${url}/functions/v1/delete-account`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', confirmation: 'delete-my-account', receipt: lastReceipt }) });
  assert.equal(wrongOwner.status, 403);
  pass('request loss keeps local records and durable intent; mismatched account receipt is rejected');
  stage = 'first real deletion batch';
  await c.resume();
  assert.ok(responses.some(r => r.action === 'delete' && r.status === 202 && r.state === 'deleting'));
  assert.equal(c.getSnapshot().complete, false); assert.equal(deleteRequests, 1);
  assert.deepEqual(await local.db.getAllAsync('SELECT * FROM saved_courses'), local.saved);
  const stale = clientFor(a.token);
  assert.deepEqual((await stale.from('personal_records').select('*')).data, []);
  const latePath = `${a.owner}/course/${randomBytes(16).toString('hex')}/${orphanHash}.json`;
  assert.ok((await stale.storage.from('personal-records').upload(latePath, new TextEncoder().encode('{}'), { contentType: 'application/json' })).error);
  const row = aRows.data[0];
  assert.ok((await stale.rpc('commit_personal_record', { p_kind: row.kind, p_id: row.record_id, p_expected_version: 0, p_mutation_id: row.mutation_id, p_deleted: false, p_summary: row.summary, p_payload_path: row.payload_path, p_payload_hash: row.payload_hash })).error);
  assert.equal((await a.client.auth.getUser(a.token)).data.user.id, a.owner);
  pass('501-file account yields HTTP 202 after 500 removals; live JWT cannot read, upload, or retry commits while deleting');
  stage = 'delete completion with response loss';
  fault = 'after-delete'; await c.resume();
  assert.ok(responses.some(r => r.action === 'delete' && r.status === 200 && r.state === 'deleted'));
  assert.equal(c.getSnapshot().complete, false); assert.equal(c.getSnapshot().pending, true);
  assert.deepEqual(await local.db.getAllAsync('SELECT * FROM running_points'), local.points);
  local.setOwner(''); c = controller(); await c.start(); await c.resume();
  assert.equal(c.getSnapshot().complete, true); assert.equal(secure.size, 0); assert.equal(deleteRequests, 2);
  const retainedCourses = await local.db.getAllAsync('SELECT * FROM saved_courses'), retainedRuns = await local.db.getAllAsync('SELECT * FROM running_sessions');
  assert.deepEqual(retainedCourses.map(content), local.saved.map(content));
  assert.deepEqual(retainedRuns.map(content), local.running.map(content));
  assert.deepEqual(await local.db.getAllAsync('SELECT * FROM running_points'), local.points);
  assert.ok([...retainedCourses, ...retainedRuns].every(row => row.owner_id === '' && row.remote_version === 0 && row.dirty === 1));
  assert.equal((await local.courses.get(local.course.id)).name, 'Hosted withdrawal QA 0');
  assert.equal((await local.runs.points(local.run.id)).length, 2);
  pass('lost HTTP 200 recovers after controller recreation without login; guest course/run/GPS content hashes are unchanged');
  stage = 'deleted auth and other account checks';
  assert.equal(await remote.status(lastReceipt), 'deleted');
  assert.equal((await clientFor().auth.signInWithPassword(credentials[0])).data.session, null);
  assert.deepEqual((await stale.from('personal_records').select('*')).data, []);
  assert.ok((await stale.storage.from('personal-records').upload(latePath, new TextEncoder().encode('{}'), { contentType: 'application/json' })).error);
  const afterB = await b.client.from('personal_records').select('*').order('record_id');
  assert.deepEqual(afterB.data, beforeB.data);
  for (const row of beforeB.data) assert.equal(hash(await other.remote.download(row.payload_path)), row.payload_hash);
  pass('deleted account cannot sign in or write with its old JWT; other account rows and payload hashes stay identical');
  stage = 'second fixture cleanup';
  const remoteB = createWithdrawalRemote({ url, key, token: async () => b.token, fetch: safeFetch });
  assert.equal(await remoteB.remove(b.owner, receiptB.receipt), 'deleted');
  assert.equal(await remoteB.status(receiptB.receipt), 'deleted');
  assert.equal((await clientFor().auth.signInWithPassword(credentials[1])).data.session, null);
  pass('both disposable accounts deleted through deployed API; signed completion checks pass');
  report.responses = responses; report.fixtureOwners = clients.map(c => c.owner);
  report.retained = { courses: retainedCourses.length, runs: retainedRuns.length, gps: local.points.length, courseContentSha256: hash(JSON.stringify(retainedCourses.map(content))), runContentSha256: hash(JSON.stringify(retainedRuns.map(content))), gpsSha256: hash(JSON.stringify(local.points)) };
  report.completedAt = new Date().toISOString(); report.passed = true;
} catch (error) {
  report.passed = false; report.failedStage = stage;
  console.error(`FAIL at ${stage}: ${error instanceof assert.AssertionError ? error.message : error?.code ?? error?.name ?? 'unknown error'}`);
  process.exitCode = 1;
} finally {
  for (const db of databases) await db.closeAsync();
  await writeFile(new URL('hosted-result.json', directory), JSON.stringify(report, null, 2));
}
