import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createDeletionReceipts } from '../supabase/functions/delete-account/receipts.ts';
import { createDeletionHandler } from '../supabase/functions/delete-account/handler.ts';
import { createDeletionBackend } from '../supabase/functions/delete-account/backend.ts';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const secret = 'ab'.repeat(32), audience = 'https://fixture.invalid';
const request = (body, token = '') => new Request(`${audience}/delete-account`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});

test('receipt verifies only for its server/key, is unique, expires and cannot be tampered with', async () => {
  let now = 1_000_000;
  const signer = createDeletionReceipts(secret, audience, () => now);
  const first = await signer.issue(A), second = await signer.issue(A);
  assert.notEqual(first.receipt, second.receipt);
  assert.equal(first.expiresAt, 1000 + 86400);
  assert.deepEqual(await signer.read(first.receipt), { owner: A });
  assert.equal(await createDeletionReceipts('cd'.repeat(32), audience, () => now).read(first.receipt), null);
  assert.equal(await createDeletionReceipts(secret, 'https://other.invalid', () => now).read(first.receipt), null);
  const [body, signature] = first.receipt.split('.');
  const modified = Buffer.from(Buffer.from(body, 'base64url').toString().replace(A, B)).toString('base64url');
  for (const bad of ['', 'a.b.c', `${modified}.${signature}`, `${body}.a`, first.receipt + '\n', 'a'.repeat(2000)]) assert.equal(await signer.read(bad), null);
  now = 999_000; assert.equal(await signer.read(first.receipt), null, 'future issuance is rejected');
  now = first.expiresAt * 1000; assert.equal(await signer.read(first.receipt), null, 'exact expiry fails closed');
  await assert.rejects(signer.issue('../other'));
  assert.throws(() => createDeletionReceipts('short', audience));
});

function fixture() {
  let removed = false, validUser = true, owner = A;
  const calls = [];
  const backend = {
    async user(token) { assert.equal(token, 'fixture-auth'); calls.push('user'); return validUser ? { id: owner, anonymous: false } : null; },
    async accountExists(id) { assert.equal(id, A); calls.push('exists'); return !removed; },
    async begin(id) { assert.equal(id, A); calls.push('begin'); },
    async files() { calls.push('files'); return []; },
    async remove() { throw new Error('No files expected'); },
    async deleteUser() { calls.push('delete'); removed = true; validUser = false; },
  };
  const signer = createDeletionReceipts(secret, audience);
  const handle = createDeletionHandler(backend, signer);
  return { backend, calls, handle, setOwner: value => { owner = value; },
    prepare: async () => {
      const response = await handle(request({ action: 'prepare' }, 'fixture-auth'));
      assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.state, 'prepared'); return result.receipt;
    },
  };
}

test('preparation is authenticated and makes no deletion changes; receipt-only deletion is forbidden', async () => {
  const f = fixture();
  assert.equal((await f.handle(request({ action: 'prepare' }))).status, 401);
  const receipt = await f.prepare(); assert.deepEqual(f.calls, ['user']);
  const state = await f.handle(request({ action: 'status', receipt }));
  assert.deepEqual(await state.json(), { state: 'not_deleted' });
  assert.equal(state.headers.get('cache-control'), 'no-store');
  assert.equal((await f.handle(request({ action: 'delete', confirmation: 'delete-my-account', receipt }))).status, 401);
  assert.equal(f.calls.includes('begin'), false);
});

test('lost Auth deletion response can be confirmed with the previously saved receipt after session loss', async () => {
  const f = fixture(); const receipt = await f.prepare();
  const remove = f.backend.deleteUser;
  f.backend.deleteUser = async () => { await remove(); throw new Error('lost network response'); };
  const response = await f.handle(request({ action: 'delete', confirmation: 'delete-my-account', receipt }, 'fixture-auth'));
  assert.equal(response.status, 503);
  const calls = [...f.calls];
  const status = await f.handle(request({ action: 'status', receipt }));
  assert.equal(status.status, 200); assert.deepEqual(await status.json(), { state: 'deleted' });
  assert.deepEqual(f.calls, [...calls, 'exists'], 'status does not retry destructive operations');
});

test('another signed-in account cannot use an existing receipt to start deletion', async () => {
  const f = fixture(); const receipt = await f.prepare(); f.setOwner(B);
  const response = await f.handle(request({ action: 'delete', confirmation: 'delete-my-account', receipt }, 'fixture-auth'));
  assert.equal(response.status, 403); assert.deepEqual(f.calls, ['user', 'user']);
});

test('invalid receipt never queries account state and backend outage never becomes deleted', async () => {
  const f = fixture();
  assert.equal((await f.handle(request({ action: 'status', receipt: 'forged' }))).status, 401);
  assert.deepEqual(f.calls, []);
  const receipt = await f.prepare(); f.backend.accountExists = async () => { throw new Error('internal credential detail'); };
  const response = await f.handle(request({ action: 'status', receipt }));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { state: 'retry_required' });
});

test('installed SDK accepts only explicit Auth user_not_found as completed removal', async () => {
  for (const [status, body, expected] of [
    [200, { id: A, aud: 'authenticated' }, true],
    [404, { code: 'user_not_found', msg: 'User not found' }, false],
    [404, { code: 'unknown', msg: 'Gateway route unavailable' }, 'reject'],
    [403, { code: 'user_not_found', msg: 'Forbidden' }, 'reject'],
    [200, { id: B, aud: 'authenticated' }, 'reject'],
  ]) {
    const admin = createClient(audience, 'fixture-admin', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        assert.equal(new URL(input).pathname, `/auth/v1/admin/users/${A}`);
        assert.equal(new Headers(init.headers).get('authorization'), 'Bearer fixture-admin');
        assert.equal(init.method, 'GET');
        return Response.json(body, { status, headers: { 'x-supabase-api-version': '2024-01-01' } });
      } },
    });
    const lookup = createDeletionBackend(admin).accountExists(A);
    if (expected === 'reject') await assert.rejects(lookup); else assert.equal(await lookup, expected);
  }
});
