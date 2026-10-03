import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTH_PENDING_KEY, AUTH_REDIRECT_URL, authConfig, parseAuthCallback } from '../src/modules/auth/config.ts';
import { createAuthController } from '../src/modules/auth/controller.ts';
import { createSecureStorage } from '../src/modules/auth/secure-storage.ts';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function memory() {
  const data = new Map();
  return { data, getItem: async k => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); }, removeItem: async k => { data.delete(k); } };
}
const session = { access_token: 'test-only', refresh_token: 'test-only', user: { id: 'test-user', email: 'runner@example.test', user_metadata: { full_name: '테스트 러너' } } };
function fixture(options = {}) {
  const storage = options.storage ?? memory();
  const browser = deferred();
  let saved = options.session ?? null;
  let listener;
  const calls = { oauth: 0, exchange: 0, logout: [], active: [] };
  const auth = {
    getSession: async () => ({ data: { session: saved }, error: null }),
    onAuthStateChange: cb => { listener = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    signInWithOAuth: async args => {
      calls.oauth++; assert.equal(args.provider, 'google'); assert.equal(args.options.redirectTo, AUTH_REDIRECT_URL);
      assert.equal(args.options.skipBrowserRedirect, true);
      return { data: { url: 'https://example.test/authorize?code_challenge_method=s256', flowId: 'test-flow-123' }, error: null };
    },
    exchangeCodeForSession: async (code, opts) => {
      calls.exchange++; assert.equal(code, 'test-code'); assert.equal(opts.flowId, 'test-flow-123');
      if (options.exchangeGate) await options.exchangeGate.promise;
      if (options.exchangeError) return { data: { session: null }, error: new Error('secret details must not be shown') };
      saved = session; listener?.('SIGNED_IN', saved);
      return { data: { session: saved }, error: null };
    },
    signOut: async args => {
      calls.logout.push(args); saved = options.keepSession ? saved : null;
      if (!saved) listener?.('SIGNED_OUT', null);
      return { error: options.logoutError ? new Error('offline') : null };
    },
    startAutoRefresh: async () => { calls.active.push(true); }, stopAutoRefresh: async () => { calls.active.push(false); },
  };
  const controller = createAuthController({ auth, storage, now: () => 1000000, openBrowser: () => browser.promise, canChangeAccount:options.canChangeAccount });
  return { controller, auth, storage, calls, browser };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const callback = `${AUTH_REDIRECT_URL}?code=test-code`;

test('account actions respect an unfinished running guard without contacting the provider',async()=>{
  const signedOut=fixture({canChangeAccount:async()=>false});await signedOut.controller.signIn();assert.equal(signedOut.calls.oauth,0);assert.match(signedOut.controller.getSnapshot().message,/러닝/);assert.equal(signedOut.controller.getSnapshot().busy,false);
  const signedIn=fixture({session,canChangeAccount:async()=>false});await signedIn.controller.signOut();assert.deepEqual(signedIn.calls.logout,[]);assert.ok(signedIn.controller.getSnapshot().account);assert.match(signedIn.controller.getSnapshot().message,/러닝/);
});

test('only HTTPS and publishable keys are accepted; server credentials fail closed', () => {
  assert.deepEqual(authConfig(' https://test.supabase.co/ ', 'sb_publishable_test'), { url: 'https://test.supabase.co', key: 'sb_publishable_test' });
  for (const key of [undefined, '', 'sb_secret_private', 'eyJ.service_role', 'sb_publishable_test\nwrong']) assert.equal(authConfig('https://test.supabase.co', key), null);
  for (const url of ['', 'http://test.supabase.co', 'https://user:pass@test.supabase.co', 'https://test.supabase.co/path', 'https://test.supabase.co?foo=1']) assert.equal(authConfig(url, 'sb_publishable_test'), null);
});

test('callback checks exact destination and refuses implicit tokens, duplicate/empty codes and provider errors', () => {
  assert.deepEqual(parseAuthCallback(callback), { code: 'test-code' });
  for (const url of ['https://auth/callback?code=x', 'runningart://auth/callback-other?code=x', 'runningart://user@auth/callback?code=x', 'runningart://evil/callback?code=x']) assert.equal(parseAuthCallback(url), null);
  for (const suffix of ['', '?code=', '?code=a&code=b', '#access_token=private', '?code=a#access_token=private']) assert.deepEqual(parseAuthCallback(AUTH_REDIRECT_URL + suffix), { error: 'invalid' });
  assert.deepEqual(parseAuthCallback(AUTH_REDIRECT_URL + '?error=access_denied&error_description=secret'), { error: 'cancelled' });
});

test('secure storage roundtrips large multilingual sessions across restarts and removes data', async () => {
  const native = memory(); let id = 0;
  const storage = createSecureStorage(native, () => `generation-${++id}`);
  const value = JSON.stringify({ name: '한글🏃'.repeat(1400), token: 'test'.repeat(1500) });
  await storage.setItem('session', value);
  for (const v of native.data.values()) assert.ok(Buffer.byteLength(v) < 2048);
  const restarted = createSecureStorage(native, () => `generation-${++id}`);
  assert.equal(await restarted.getItem('session'), value);
  await restarted.setItem('session', 'new');
  assert.equal(native.data.size, 2);
  await restarted.removeItem('session'); assert.equal(native.data.size, 0);
});

test('partial secure-store writes preserve the old session and concurrent mutations serialize', async () => {
  const native = memory(); let id = 0; let fail = false;
  const storage = createSecureStorage({ ...native, setItem: async (k, v) => { if (fail && k.endsWith('.1')) throw new Error('disk'); await native.setItem(k, v); } }, () => `g-${++id}`);
  await storage.setItem('session', 'old'); fail = true;
  await assert.rejects(storage.setItem('session', 'x'.repeat(1000)));
  assert.equal(await storage.getItem('session'), 'old'); fail = false;
  await Promise.all([storage.setItem('session', 'one'), storage.setItem('session', 'two'), storage.removeItem('session')]);
  assert.equal(await storage.getItem('session'), null); assert.equal(native.data.size, 0);
});

test('missing encrypted chunk fails closed', async () => {
  const native = memory(); const storage = createSecureStorage(native, () => 'generation');
  await storage.setItem('session', 'private'); native.data.delete('session.generation.0');
  await assert.rejects(storage.getItem('session'), /Incomplete/);
});

test('browser callback and deep link exchange once, report account, then local logout clears it', async () => {
  const gate = deferred(); const f = fixture({ exchangeGate: gate });
  await f.controller.start(); const login = f.controller.signIn(); await tick();
  await f.controller.signIn(); assert.equal(f.calls.oauth, 1);
  const a = f.controller.handleUrl(callback); const b = f.controller.handleUrl(callback);
  await tick(); assert.equal(f.calls.exchange, 1);
  f.browser.resolve({ type: 'success', url: callback });
  assert.equal(a, b);
  gate.resolve(); await Promise.all([a, b, login]);
  assert.equal(f.controller.getSnapshot().account.name, '테스트 러너');
  await f.controller.signOut(); assert.equal(f.controller.getSnapshot().account, null);
});

test('successful login, duplicate browser return, session restore and scoped logout', async () => {
  const gate = deferred(); const f = fixture({ exchangeGate: gate });
  await f.controller.start(); const login = f.controller.signIn(); await tick();
  const event = f.controller.handleUrl(callback); await tick();
  f.browser.resolve({ type: 'success', url: callback }); gate.resolve();
  await Promise.all([event, login]);
  assert.equal(f.calls.exchange, 1); assert.equal(f.controller.getSnapshot().account.email, 'runner@example.test');
  assert.equal(await f.storage.getItem(AUTH_PENDING_KEY), null);
  const restarted = fixture({ session }); await restarted.controller.start();
  assert.deepEqual(restarted.controller.getSnapshot().account, f.controller.getSnapshot().account);
  await f.controller.signOut(); assert.deepEqual(f.calls.logout, [{ scope: 'local' }]);
  assert.equal(f.controller.getSnapshot().account, null);
  await f.controller.handleUrl(callback); assert.equal(f.calls.exchange, 1);
});

test('cancellation unlocks retry and a late callback cannot authenticate', async () => {
  const f = fixture(); const login = f.controller.signIn(); await tick();
  f.browser.resolve({ type: 'cancel' }); await login;
  assert.equal(f.controller.getSnapshot().busy, false); assert.match(f.controller.getSnapshot().message, /취소/);
  await f.controller.handleUrl(callback); assert.equal(f.calls.exchange, 0);
  await f.controller.signIn(); assert.equal(f.calls.oauth, 2);
});

test('cold-start callback uses persisted attempt; expired attempt makes no exchange', async () => {
  const storage = memory();
  await storage.setItem(AUTH_PENDING_KEY, JSON.stringify({ createdAt: 999999, flowId: 'test-flow-123' }));
  const f = fixture({ storage }); await f.controller.handleUrl(callback);
  assert.equal(f.calls.exchange, 1); assert.ok(f.controller.getSnapshot().account);
  await storage.setItem(AUTH_PENDING_KEY, JSON.stringify({ createdAt: 1, flowId: 'test-flow-123' }));
  const expired = fixture({ storage }); await expired.controller.handleUrl(callback);
  assert.equal(expired.calls.exchange, 0); assert.equal(expired.controller.getSnapshot().account, null);
});

test('exchange failure hides raw credentials and allows a new attempt', async () => {
  const f = fixture({ exchangeError: true }); const login = f.controller.signIn(); await tick();
  f.browser.resolve({ type: 'success', url: callback }); await login;
  assert.equal(f.controller.getSnapshot().account, null); assert.equal(f.controller.getSnapshot().busy, false);
  assert.doesNotMatch(f.controller.getSnapshot().message, /secret/); assert.equal(await f.storage.getItem(AUTH_PENDING_KEY), null);
});

test('logout distinguishes remote failure with local removal from a retained session', async () => {
  const offline = fixture({ session, logoutError: true }); await offline.controller.start(); await offline.controller.signOut();
  assert.equal(offline.controller.getSnapshot().account, null); assert.match(offline.controller.getSnapshot().message, /서버/);
  const failed = fixture({ session, logoutError: true, keepSession: true }); await failed.controller.start(); await failed.controller.signOut();
  assert.ok(failed.controller.getSnapshot().account); assert.match(failed.controller.getSnapshot().message, /완료하지 못/);
});

test('foreground lifecycle controls token refresh and missing configuration is usable signed out', async () => {
  const f = fixture(); f.controller.setActive(true); f.controller.setActive(false); assert.deepEqual(f.calls.active, [true, false]);
  const unavailable = createAuthController({ auth: null, storage: memory(), openBrowser: () => { throw new Error('must not open'); } });
  await unavailable.start(); await unavailable.signIn(); assert.equal(unavailable.getSnapshot().configured, false);
  assert.equal(unavailable.getSnapshot().ready, true);
});

test('plain PKCE never launches a browser and clears the pending attempt', async () => {
  const f = fixture();
  f.auth.signInWithOAuth = async () => ({ data: { url: 'https://example.test/authorize?code_challenge_method=plain' }, error: null });
  await f.controller.signIn();
  assert.equal(await f.storage.getItem(AUTH_PENDING_KEY), null);
  assert.match(f.controller.getSnapshot().message, /완료하지 못/);
});
