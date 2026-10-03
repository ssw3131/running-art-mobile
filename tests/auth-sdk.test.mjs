import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createSecureStorage } from '../src/modules/auth/secure-storage.ts';
import { AUTH_REDIRECT_URL } from '../src/modules/auth/config.ts';

// Real installed SDK + secure-storage adapter. HTTP is a local contract fixture,
// not evidence of a real Google account or the remote Supabase configuration.
test('Supabase SDK uses S256, exchanges its stored verifier, persists/refreshes and signs out locally', async () => {
  const items = new Map(); let id = 0;
  const storage = createSecureStorage({
    getItem: async k => items.get(k) ?? null,
    setItem: async (k, v) => { items.set(k, v); },
    removeItem: async k => { items.delete(k); },
  }, () => `generation-${++id}`);
  const requests = [];
  const user = { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', email: 'runner@example.test', user_metadata: { full_name: '테스트 계정' }, app_metadata: { provider: 'google' }, created_at: new Date().toISOString() };
  const payload = suffix => ({ access_token: `test-access-${suffix}`, refresh_token: `test-refresh-${suffix}`, token_type: 'bearer', expires_in: 3600, user });
  let challenge;
  const fetch = async (input, init) => {
    const url = new URL(input); const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ path: url.pathname, grant: url.searchParams.get('grant_type'), scope: url.searchParams.get('scope') });
    if (url.searchParams.get('grant_type') === 'pkce') {
      assert.equal(body.auth_code, 'one-time-test-code');
      assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'), challenge);
      return new Response(JSON.stringify(payload('first')), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      assert.equal(body.refresh_token, 'test-refresh-first');
      return new Response(JSON.stringify(payload('refreshed')), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
    throw new Error('Unexpected SDK request');
  };
  const make = () => createClient('https://contract.supabase.co', 'sb_publishable_contract_test', {
    auth: { storage, storageKey: 'test-auth', flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: false },
    global: { fetch },
  });
  const first = make();
  const oauth = await first.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: AUTH_REDIRECT_URL, skipBrowserRedirect: true } });
  assert.equal(oauth.error, null);
  const authorize = new URL(oauth.data.url);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 's256');
  assert.equal(authorize.searchParams.get('redirect_to'), AUTH_REDIRECT_URL);
  challenge = authorize.searchParams.get('code_challenge');
  const exchanged = await first.auth.exchangeCodeForSession('one-time-test-code', { flowId: oauth.data.flowId });
  assert.equal(exchanged.error, null); assert.equal(exchanged.data.session.user.email, user.email);
  await first.auth.stopAutoRefresh();
  const restarted = make();
  assert.equal((await restarted.auth.getSession()).data.session.user.id, user.id);
  assert.equal(requests.length, 1, 'unexpired session restoration needs no HTTP');
  const refreshed = await restarted.auth.refreshSession(); assert.equal(refreshed.error, null);
  assert.equal((await restarted.auth.getSession()).data.session.refresh_token, 'test-refresh-refreshed');
  assert.equal((await restarted.auth.signOut({ scope: 'local' })).error, null);
  assert.equal((await restarted.auth.getSession()).data.session, null);
  assert.equal(requests.at(-1).scope, 'local');
  assert.equal(await storage.getItem('test-auth'), null);
  assert.equal(items.size, 0, 'logout removes encrypted session and all pending SDK verifiers');
  await restarted.auth.stopAutoRefresh();
});
