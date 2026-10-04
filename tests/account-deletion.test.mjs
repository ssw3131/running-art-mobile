import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createDeletionHandler } from '../supabase/functions/delete-account/handler.ts';
import { createDeletionBackend } from '../supabase/functions/delete-account/backend.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const path = (n, owner = A) => `${owner}/course/${n.toString(16).padStart(32, '0')}/${'a'.repeat(64)}.json`;
const request = (body = { action: 'delete', confirmation: 'delete-my-account', receipt: 'fixture-receipt' }, token = 'test-token') => new Request('https://local.invalid/delete-account', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
const receipts = {
  issue: async () => ({ receipt: 'fixture-receipt', expiresAt: 123 }),
  read: async value => value === 'fixture-receipt' ? { owner: A } : null,
};
function fixture(size = 1) {
  const calls = [], objects = Array.from({ length: size }, (_, i) => path(i));
  let gate = false, deleted = false;
  const backend = {
    async user(token) { calls.push(['user', token]); return { id: A, anonymous: false }; },
    async accountExists(owner) { assert.equal(owner, A); return !deleted; },
    async begin(owner) { assert.equal(owner, A); calls.push(['begin']); gate = true; },
    async files(owner) { assert.equal(owner, A); assert.ok(gate); calls.push(['files']); return objects.slice(0, 100); },
    async remove(paths) { assert.ok(gate); calls.push(['remove', paths]); for (const p of paths) objects.splice(objects.indexOf(p), 1); },
    async deleteUser(owner) { assert.equal(owner, A); assert.equal(objects.length, 0); calls.push(['delete']); deleted = true; },
  };
  return { backend, calls, objects, deleted: () => deleted, gate: () => gate, run: () => createDeletionHandler(backend, receipts)(request()) };
}

test('deletion requires POST, bearer and exact bounded confirmation before any backend call', async () => {
  const f = fixture(); const handler = createDeletionHandler(f.backend, receipts);
  for (const [input, status] of [
    [new Request('https://local.invalid'), 405],
    [request(undefined, ''), 401],
    [request({ confirmation: 'delete-my-account', owner: B }), 400],
    [request({ confirmation: 'yes' }), 400],
    [request({ confirmation: 'x'.repeat(4000) }), 400],
    [request(null), 400],
  ]) assert.equal((await handler(input)).status, status);
  assert.deepEqual(f.calls, []);
});

test('invalid, anonymous or malformed identities never start deletion', async () => {
  for (const user of [null, { id: A, anonymous: true }, { id: '../other', anonymous: false }]) {
    const f = fixture(); f.backend.user = async () => user;
    assert.equal((await f.run()).status, 401);
    assert.equal(f.gate(), false); assert.equal(f.deleted(), false);
  }
});

test('deletion drains more than one page, gates first and deletes Auth last', async () => {
  const f = fixture(201); const response = await f.run();
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { state: 'deleted' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(f.calls.map(c => c[0]), ['user', 'begin', 'files', 'remove', 'files', 'remove', 'files', 'remove', 'files', 'delete']);
  assert.ok(f.deleted());
});

test('large accounts return pending and resume without offset skips', async () => {
  const f = fixture(605);
  assert.equal((await f.run()).status, 202); assert.equal(f.objects.length, 105); assert.equal(f.deleted(), false);
  assert.equal((await f.run()).status, 200); assert.equal(f.objects.length, 0); assert.ok(f.deleted());
});

test('a foreign, unsafe or malformed listing aborts before removal or Auth deletion', async () => {
  for (const listing of [[path(1, B)], [`${A}/../secret`], [path(1), path(1)], null, [null], Array(101).fill(path(1))]) {
    const f = fixture(); f.backend.files = async () => listing;
    assert.equal((await f.run()).status, 503);
    assert.equal(f.deleted(), false); assert.equal(f.calls.some(c => c[0] === 'remove'), false);
  }
});

test('partial Storage failure retains the gate and retries remaining files', async () => {
  const f = fixture(4); const remove = f.backend.remove;
  f.backend.remove = async paths => { await remove(paths.slice(0, 2)); throw new Error('private backend details'); };
  const response = await f.run();
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { state: 'retry_required' });
  assert.ok(f.gate()); assert.equal(f.deleted(), false); assert.equal(f.objects.length, 2);
  f.backend.remove = remove;
  assert.equal((await f.run()).status, 200); assert.ok(f.deleted());
});

test('failures at each server boundary do not claim success or expose raw errors', async () => {
  for (const step of ['user', 'begin', 'files', 'remove', 'deleteUser']) {
    const f = fixture(); f.backend[step] = async () => { throw new Error('secret-key account-path internal-error'); };
    const response = await f.run();
    assert.equal(response.status, 503); assert.equal(f.deleted(), false);
    assert.deepEqual(await response.json(), { state: 'retry_required' });
  }
});

test('lost Auth deletion response is not treated as success on unauthenticated retry', async () => {
  const f = fixture();
  f.backend.deleteUser = async () => { f.backend.user = async () => null; throw new Error('response lost'); };
  assert.equal((await f.run()).status, 503);
  const response = await f.run();
  assert.equal(response.status, 401); assert.deepEqual(await response.json(), { state: 'authentication_required' });
});

test('installed Supabase SDK verifies user bearer then preserves admin bearer for owner-scoped RPC/Storage/Auth', async () => {
  const calls = []; let remaining = [path(1)];
  const admin = createClient('https://local.invalid', 'test-admin-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input); const body = init.body ? JSON.parse(init.body) : null;
      const bearer = new Headers(init.headers).get('authorization'); calls.push(url.pathname);
      if (url.pathname === '/auth/v1/user') {
        assert.equal(bearer, 'Bearer test-token');
        return Response.json({ id: A, aud: 'authenticated', is_anonymous: false });
      }
      assert.equal(bearer, 'Bearer test-admin-key');
      if (url.pathname === '/rest/v1/rpc/begin_account_deletion') {
        assert.deepEqual(body, { p_owner: A }); return new Response(null, { status: 204 });
      }
      if (url.pathname === '/rest/v1/rpc/account_deletion_files') {
        assert.deepEqual(body, { p_owner: A }); return Response.json(remaining);
      }
      if (url.pathname === '/storage/v1/object/personal-records') {
        assert.equal(init.method, 'DELETE'); assert.deepEqual(body, { prefixes: [path(1)] }); remaining = []; return Response.json([]);
      }
      if (url.pathname === `/auth/v1/admin/users/${A}`) {
        assert.equal(init.method, 'DELETE'); assert.deepEqual(body, { should_soft_delete: false }); return Response.json({ id: A });
      }
      throw new Error(`Unexpected SDK request ${url.pathname}`);
    } },
  });
  const response = await createDeletionHandler(createDeletionBackend(admin), receipts)(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['/auth/v1/user', '/rest/v1/rpc/begin_account_deletion', '/rest/v1/rpc/account_deletion_files', '/storage/v1/object/personal-records', '/rest/v1/rpc/account_deletion_files', `/auth/v1/admin/users/${A}`]);
});
