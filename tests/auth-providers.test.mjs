import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createAuthController } from '../src/modules/auth/controller.ts';
import { AUTH_PENDING_KEY, AUTH_REDIRECT_URL } from '../src/modules/auth/config.ts';
import { configuredSignInProviders, oauthRequest, signInProviderLabels } from '../src/modules/auth/providers.ts';

const providers = ['google', 'kakao', 'custom:naver'];
const callback = `${AUTH_REDIRECT_URL}?code=one-time-test-code`;
function memory() {
  const data = new Map();
  return { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); }, removeItem: async key => { data.delete(key); } };
}
function fixture(provider, options = {}) {
  const storage = options.storage ?? memory(); const calls = [];
  let session = options.session ?? null; let event;
  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: cb => { event = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    signInWithOAuth: async args => {
      calls.push(['oauth', args]); assert.equal(args.provider, provider);
      return { data: { url: `https://local.invalid/authorize?code_challenge_method=s256&provider=${provider}`, flowId: 'provider-flow' }, error: null };
    },
    exchangeCodeForSession: async (code, options) => {
      calls.push(['exchange', code, options]);
      session = { access_token: 'fixture-token', user: { id: '11111111-1111-4111-8111-111111111111', user_metadata: { preferred_username: '카카오 별명' }, identities: [{ provider }] } };
      event?.('SIGNED_IN', session); return { data: { session }, error: null };
    },
  };
  const controller = createAuthController({ auth, storage, providers: options.providers ?? providers, now: () => 1_000_000,
    openBrowser: async () => {
      calls.push(['browser']);
      assert.equal(JSON.parse(await storage.getItem(AUTH_PENDING_KEY)).provider, provider);
      return options.result ?? { type: 'success', url: callback };
    },
  });
  return { controller, storage, calls, auth };
}

test('only exact verified-provider build flags expose extra sign-in options', async () => {
  assert.deepEqual(configuredSignInProviders(), ['google']);
  for (const value of ['', 'false', 'TRUE', '1', 'yes', ' true ']) assert.deepEqual(configuredSignInProviders(value, value), ['google']);
  assert.deepEqual(configuredSignInProviders('true', 'false'), ['google', 'kakao']);
  assert.deepEqual(configuredSignInProviders('false', 'true'), ['google', 'custom:naver']);
  assert.deepEqual(configuredSignInProviders('true', 'true'), providers);
  const f = fixture('google', { providers: configuredSignInProviders() });
  for (const provider of ['kakao', 'custom:naver', 'custom:untrusted', '__proto__']) await f.controller.signIn(provider);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.controller.getSnapshot().providers, ['google']);
  assert.match(f.controller.getSnapshot().message, /아직 사용할 수 없는/);
});

test('each selected provider shares the guarded PKCE flow and reports its actual label', async () => {
  for (const provider of providers) {
    const f = fixture(provider); await f.controller.signIn(provider);
    assert.deepEqual(f.calls[0], ['oauth', oauthRequest(provider)]);
    assert.deepEqual(f.calls.at(-1), ['exchange', 'one-time-test-code', { flowId: 'provider-flow' }]);
    assert.equal(f.controller.getSnapshot().message, `${signInProviderLabels[provider]} 로그인되었습니다.`);
    assert.equal(f.controller.getSnapshot().account.name, '카카오 별명');
    assert.equal(f.controller.getSnapshot().account.email, '');
    assert.deepEqual(f.controller.getSnapshot().account.providers, [provider]);
    assert.equal(await f.storage.getItem(AUTH_PENDING_KEY), null);
  }
});

test('provider cold-start callbacks restore selection; disabled or invalid persisted selection cannot exchange', async () => {
  for (const provider of providers) {
    const f = fixture(provider);
    await f.storage.setItem(AUTH_PENDING_KEY, JSON.stringify({ provider, flowId: 'provider-flow', createdAt: 999999 }));
    await f.controller.handleUrl(callback);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'exchange');
    assert.equal(f.controller.getSnapshot().message, `${signInProviderLabels[provider]} 로그인되었습니다.`);
  }
  for (const pending of [{ provider: 'kakao' }, { provider: 'custom:unknown' }, { flowId: 22 }, null]) {
    const f = fixture('google', { providers: ['google'] });
    await f.storage.setItem(AUTH_PENDING_KEY, JSON.stringify(pending === null ? null : { createdAt: 999999, ...pending }));
    await f.controller.handleUrl(callback);
    assert.deepEqual(f.calls, []); assert.equal(f.controller.getSnapshot().account, null);
  }
});

test('all providers clear attempts after browser cancellation or consent rejection', async () => {
  for (const provider of providers) for (const result of [{ type: 'cancel' }, { type: 'success', url: `${AUTH_REDIRECT_URL}?error=access_denied` }]) {
    const f = fixture(provider, { result }); await f.controller.signIn(provider);
    assert.equal(f.calls.some(c => c[0] === 'exchange'), false);
    assert.match(f.controller.getSnapshot().message, /취소/);
    assert.equal(f.controller.getSnapshot().busy, false);
    assert.equal(await f.storage.getItem(AUTH_PENDING_KEY), null);
    await f.controller.handleUrl(callback);
    assert.equal(f.calls.some(c => c[0] === 'exchange'), false);
  }
});

test('restoring an existing session cannot launch a second provider before readiness', async () => {
  const f = fixture('kakao', { session: { user: { id: 'existing', user_metadata: { name: '기존' } } } });
  await f.controller.signIn('kakao');
  assert.deepEqual(f.calls, []); assert.equal(f.controller.getSnapshot().account.id, 'existing');
  assert.equal(f.controller.getSnapshot().busy, false);
});

test('all providers serialize simultaneous selection and keep original flow selection', async () => {
  let resolve; const gate = new Promise(r => { resolve = r; });
  const f = fixture('kakao'); const original = f.auth.signInWithOAuth;
  f.auth.signInWithOAuth = async args => { await gate; return original(args); };
  const first = f.controller.signIn('kakao'); await f.controller.signIn('custom:naver');
  resolve(); await first;
  assert.equal(f.calls.filter(c => c[0] === 'oauth').length, 1);
  assert.deepEqual(f.controller.getSnapshot().account.providers, ['kakao']);
});

test('installed SDK produces S256 for Google/Kakao/custom Naver and redeems the matching verifier', async () => {
  for (const provider of providers) {
    const storage = memory(); let challenge; let tokenRequests = 0;
    const auth = createClient('https://local.invalid', 'sb_publishable_fixture', {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage },
      global: { fetch: async (input, init) => {
        const url = new URL(input); assert.equal(url.pathname, '/auth/v1/token');
        assert.equal(url.searchParams.get('grant_type'), 'pkce');
        const body = JSON.parse(init.body); assert.equal(body.auth_code, 'one-time-test-code');
        assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'), challenge);
        tokenRequests++;
        return Response.json({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer',
          user: { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', user_metadata: { name: '러너' }, identities: [{ provider }] } });
      } },
    }).auth;
    const controller = createAuthController({ auth, storage, providers, openBrowser: async (raw, redirect) => {
      const url = new URL(raw); assert.equal(redirect, AUTH_REDIRECT_URL);
      assert.equal(url.searchParams.get('provider'), provider);
      assert.equal(url.searchParams.get('redirect_to'), AUTH_REDIRECT_URL);
      assert.equal(url.searchParams.get('code_challenge_method'), 's256');
      assert.equal(url.searchParams.get('prompt'), provider === 'google' ? 'select_account' : null);
      assert.equal(url.searchParams.get('scope'), provider === 'kakao' ? 'profile_nickname profile_image' : null);
      assert.equal(url.searchParams.has('scopes'), false, 'Kakao must replace the provider scope, not append to its email default');
      challenge = url.searchParams.get('code_challenge'); assert.ok(challenge);
      return { type: 'success', url: callback };
    } });
    await controller.signIn(provider);
    assert.equal(tokenRequests, 1); assert.equal(controller.getSnapshot().account.name, '러너');
    assert.deepEqual(controller.getSnapshot().account.providers, [provider]);
    assert.equal(await storage.getItem(AUTH_PENDING_KEY), null);
    await auth.stopAutoRefresh();
  }
});
