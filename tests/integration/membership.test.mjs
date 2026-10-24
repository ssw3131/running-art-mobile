import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isolatedSupabase } from '../../scripts/qa/isolated-supabase.mjs';
import { createMembershipRemote } from '../../src/modules/membership/remote.ts';

const { admin, client: createIsolatedClient } = isolatedSupabase();

test('DB-SIGNUP-01: real Auth pending state, concurrent RPC receipt, account isolation and cascade', async t => {
  const users = [], clients = [], policyId = `qa-${randomUUID()}`;
  t.after(async () => {
    for (const client of clients) await client.auth.signOut();
    for (const id of users) { const result = await admin.auth.admin.deleteUser(id); assert.equal(result.error, null); }
    assert.equal((await admin.from('membership_policies').delete().eq('id', policyId)).error, null);
  });
  assert.equal((await admin.from('membership_policies').insert({ id: policyId, terms_body: 'QA only — not published product terms', privacy_body: 'QA only — synthetic accounts', active: true })).error, null);
  for (let i = 0; i < 2; i++) {
    const email = `qa-signup-${randomUUID()}@example.invalid`, password = randomUUID() + 'Aa!9';
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { runpen_nickname: '보존할 이름', unrelated: 'keep' } });
    assert.equal(error, null); users.push(data.user.id);
    const client = createIsolatedClient();
    assert.equal((await client.auth.signInWithPassword({ email, password })).error, null); clients.push(client);
  }
  const remote = createMembershipRemote(clients[0]), other = createMembershipRemote(clients[1]);
  assert.equal((await remote.policy()).id, policyId);
  assert.equal((await remote.membership(users[0])).completedAt, null);
  const request = { owner: users[0], policyId, terms: true, privacy: true, requestId: randomUUID() };
  await assert.rejects(remote.accept({ ...request, privacy: false }));
  const results = await Promise.all([remote.accept(request), remote.accept(request)]);
  assert.deepEqual(results[0], results[1], 'concurrent requests return one receipt');
  // Drop the first successful response, then replay the same persisted request.
  assert.deepEqual(await remote.accept(request), results[0]);
  const receipts = await clients[0].from('membership_consents').select('*');
  assert.equal(receipts.error, null); assert.equal(receipts.data.length, 1);
  assert.equal((await clients[1].from('membership_consents').select('*')).data.length, 0);
  await assert.rejects(other.membership(users[0])); await assert.rejects(other.accept(request));
  assert.ok((await clients[0].from('memberships').update({ completed_at: null }).eq('owner_id', users[0])).error);
  const account = await admin.auth.admin.getUserById(users[0]);
  assert.equal(account.data.user.user_metadata.runpen_nickname, '보존할 이름'); assert.equal(account.data.user.user_metadata.unrelated, 'keep');
  const anonymous = createMembershipRemote(createIsolatedClient());
  await assert.rejects(anonymous.accept(request));
  const id = users.shift();
  assert.equal((await admin.auth.admin.deleteUser(id)).error, null);
  assert.equal((await admin.from('membership_consents').select('*').eq('owner_id', id)).data.length, 0);
  assert.equal((await admin.from('memberships').select('*').eq('owner_id', id)).data.length, 0);
});
