// Intentionally excluded from npm test: requires a disposable local Supabase stack.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { device, snapshot, completedRun } from '../helpers/sync-fixture.mjs';
import { synchronize } from '../../src/modules/sync/engine.ts';
import { createSyncRemote } from '../../src/modules/sync/remote.ts';

const env = JSON.parse(readFileSync(process.env.QA_SUPABASE_STATUS ?? '.cache/qa-supabase-status.json', 'utf8'));
const url = new URL(env.API_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol === 'http:', 'Only an isolated loopback stack is permitted');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url.href, env.SERVICE_ROLE_KEY, options);

test('DB-ROUNDTRIP-01: real Auth/Storage/RPC → empty SQLite, ownership and lost response', async t => {
  const users = [], clients = [];
  let injectedStatus = null;
  const controlledFetch = async (input, init) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input.url ?? input.href);
    assert.equal(requestUrl.origin, url.origin, 'Integration traffic must stay on the isolated stack');
    if (injectedStatus && requestUrl.pathname.startsWith('/storage/v1/object/') && ['POST', 'PUT'].includes(init?.method)) {
      const status = injectedStatus; injectedStatus = null;
      return new Response(JSON.stringify({ statusCode: status, error: 'InjectedTransportFailure', message: `injected HTTP ${status}` }),
        { status, headers: { 'content-type': 'application/json' } });
    }
    return fetch(input, init);
  };
  t.after(async () => {
    for (const client of clients) await client.auth.signOut();
    for (const id of users) {
      const { data } = await admin.from('personal_records').select('payload_path').eq('owner_id', id);
      await admin.from('personal_records').delete().eq('owner_id', id);
      const paths = (data ?? []).map(row => row.payload_path).filter(Boolean);
      if (paths.length) { const { error } = await admin.storage.from('personal-records').remove(paths); assert.equal(error, null); }
      const { error } = await admin.auth.admin.deleteUser(id); assert.equal(error, null);
    }
  });
  for (let i = 0; i < 2; i++) {
    const email = `qa-${randomUUID()}@example.invalid`, password = randomUUID() + 'Aa!9';
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(error, null); users.push(data.user.id);
    const client = createClient(url.href, env.ANON_KEY, { ...options, global: { fetch: controlledFetch } });
    const auth = await client.auth.signInWithPassword({ email, password }); assert.equal(auth.error, null); clients.push(client);
  }
  const owner = users[0], first = await device(t, owner), second = await device(t, owner);
  const saved = await first.courses.save(snapshot(), '공개 합성 복원 시험'), runId = await completedRun(first);
  await first.sync.enable(owner, false); await second.sync.enable(owner, false);
  const real = createSyncRemote(clients[0], owner);
  const perform = (d, remote = real) => synchronize({ owner, repository: d.sync, remote, check: () => {}, now: () => 2000000 });
  for (const code of [401, 429, 503]) {
    // Exercise the SDK's real HTTP error conversion and app transport handling.
    injectedStatus = code;
    await assert.rejects(perform(first), new RegExp(String(code)));
    assert.equal(injectedStatus, null, 'Fault must reach the HTTP boundary');
    assert.equal((await first.sync.status(owner)).pending, 2);
  }
  let lost = true;
  await assert.rejects(perform(first, { ...real, commit: async (...args) => {
    const result = await real.commit(...args); if (lost) { lost = false; throw Error('lost committed response'); } return result;
  } }), /lost/);
  await perform(first); await perform(second); await perform(second);
  assert.deepEqual(await second.courses.get(saved.id), await first.courses.get(saved.id));
  assert.deepEqual(await second.runs.get(runId), await first.runs.get(runId));
  assert.deepEqual(await second.runs.points(runId), await first.runs.points(runId));
  const own = await clients[0].from('personal_records').select('*'); assert.equal(own.error, null); assert.equal(own.data.length, 2);
  assert.ok(own.data.every(row => row.version === 1), 'lost replies must not duplicate persistence');
  const other = await clients[1].from('personal_records').select('*'); assert.equal(other.error, null); assert.deepEqual(other.data, []);
  const anonymous = createClient(url.href, env.ANON_KEY, options);
  assert.ok((await anonymous.from('personal_records').select('*')).error);
  for (const client of [clients[1], anonymous]) {
    assert.ok((await client.storage.from('personal-records').download(own.data[0].payload_path)).error);
  }
  assert.equal((await second.sync.status(owner)).pending, 0);
});
