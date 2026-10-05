// Real social PKCE smoke check using the app controller. Credentials and profile
// data stay in memory; only non-identifying check results are written to cache.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createAuthController } from '../../src/modules/auth/controller.ts';
import { AUTH_REDIRECT_URL } from '../../src/modules/auth/config.ts';

assert.ok(['--verify-kakao', '--verify-naver'].includes(process.argv[2]));
const naver = process.argv[2] === '--verify-naver';
const provider = naver ? 'custom:naver' : 'kakao', label = naver ? '네이버' : '카카오';
const slug = naver ? 'naver' : 'kakao';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(new URL(url).hostname, 'zymfblgzpidgfjjgrino.supabase.co');
const origin = 'http://localhost:3000', csrf = randomBytes(24).toString('hex');
const values = new Map(), storage = {
  getItem: async name => values.get(name) ?? null,
  setItem: async (name, value) => { values.set(name, value); },
  removeItem: async name => { values.delete(name); },
};
const report = { startedAt: new Date().toISOString(), provider, checks: [], scope: 'Real social PKCE and app controller; no Android/native storage verification' };
let phase = 'ready', client, controller, browserCallback, loginTask, navigate, owner;
const persist = () => writeFile(new URL(`../../.cache/account-expansion/${slug}-result.json`, import.meta.url), JSON.stringify(report, null, 2));
const pass = check => { report.checks.push(check); console.log(`PASS: ${check}`); };
function create() {
  client = createClient(url, key, {
    auth: { flowType: 'pkce', storage, storageKey: `runpen-${slug}-qa`, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
  });
  const auth = new Proxy(client.auth, { get(target, prop) {
    if (prop === 'signInWithOAuth') return args => target.signInWithOAuth({ ...args, options: { ...args.options, redirectTo: origin } });
    const value = Reflect.get(target, prop); return typeof value === 'function' ? value.bind(target) : value;
  } });
  controller = createAuthController({ auth, storage, providers: ['google', 'kakao', 'custom:naver'], openBrowser: async address => {
    const target = new URL(address);
    assert.equal(target.origin, url); assert.equal(target.pathname, '/auth/v1/authorize');
    assert.equal(target.searchParams.get('provider'), provider);
    assert.equal(target.searchParams.get('code_challenge_method'), 's256');
    navigate(address);
    return new Promise(resolve => { browserCallback = resolve; });
  } });
}
create();
async function verify(code) {
  assert.equal(phase, 'authenticating'); phase = 'checking';
  assert.ok(browserCallback && loginTask);
  browserCallback({ type: 'success', url: `${AUTH_REDIRECT_URL}?code=${encodeURIComponent(code)}` });
  await loginTask;
  const { data, error } = await client.auth.getUser(); assert.equal(error, null);
  assert.ok(data.user.identities.some(identity => identity.provider === provider));
  owner = data.user.id;
  assert.equal(controller.getSnapshot().account?.id, owner);
  assert.equal(controller.getSnapshot().message, `${label} 로그인되었습니다.`);
  const metadata = data.user.user_metadata ?? {};
  report.metadataFields = Object.keys(metadata);
  if (naver) {
    const current = await client.auth.getSession();
    const token = current.data.session?.provider_token;
    report.naverProviderTokenPresent = !!token;
    if (token) {
      const reply = await fetch('https://openapi.naver.com/v1/nid/me', {
        headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      report.naverProfileStatus = reply.status;
      const profile = await reply.json();
      report.naverProfileFields = Object.keys(profile.response ?? {});
      report.naverProfileSuccess = profile.resultcode === '00';
      report.naverSubjectMatches = data.user.identities.some(identity => identity.provider === provider && identity.identity_data?.sub === profile.response?.id);
      assert.equal(reply.status, 200); assert.equal(report.naverProfileSuccess, true); assert.equal(report.naverSubjectMatches, true);
      assert.equal(metadata.runpen_naver_nickname, profile.response.nickname.normalize('NFC').trim());
    }
  }
  const nameField = ['runpen_nickname', 'runpen_naver_nickname', 'full_name', 'name', 'preferred_username', 'nickname'].find(field => typeof metadata[field] === 'string' && metadata[field].trim());
  assert.ok(nameField, 'Provider name must be mapped, not replaced by the app fallback');
  assert.equal(controller.getSnapshot().account.name, metadata[nameField].trim());
  report.nameSource = nameField;
  report.emailPresent = !!data.user.email;
  report.providerPhotoPresent = !!controller.getSnapshot().account.avatarUrl;
  const rawPhoto = metadata.runpen_naver_avatar_url ?? metadata.avatar_url ?? metadata.picture;
  report.providerPhotoSupplied = typeof rawPhoto === 'string' && !!rawPhoto;
  if (report.providerPhotoSupplied) {
    try { const photo = new URL(rawPhoto); report.providerPhotoProtocol = photo.protocol; report.providerPhotoHost = photo.hostname; }
    catch { report.providerPhotoProtocol = 'invalid'; }
  }
  pass(`real ${slug} consent, Supabase code exchange and app account mapping succeed`);
  if (report.providerPhotoSupplied) {
    const picture = controller.getSnapshot().account.avatarUrl;
    assert.ok(picture); assert.equal(new URL(picture).protocol, 'https:');
    const image = await fetch(picture, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    assert.equal(image.status, 200); assert.match(image.headers.get('content-type'), /^image\//);
    await image.body?.cancel();
    pass('provider profile photo is accepted and accessible over HTTPS');
  }
  await client.auth.stopAutoRefresh(); create(); await controller.start();
  assert.equal(controller.getSnapshot().account?.id, owner);
  assert.ok(controller.getSnapshot().account.providers.includes(provider));
  assert.equal(controller.getSnapshot().account.name, metadata[nameField].trim());
  pass(`fresh SDK and app controller restore the same ${slug} session`);
  const refreshed = await client.auth.refreshSession(); assert.equal(refreshed.error, null);
  assert.equal(refreshed.data.user.id, owner);
  assert.equal(controller.getSnapshot().account.name, metadata[nameField].trim());
  pass(`${slug} Supabase session refresh succeeds`);
  await controller.signOut(); assert.equal(controller.getSnapshot().account, null);
  assert.equal((await client.auth.getSession()).data.session, null);
  values.clear();
  pass('only the temporary PC session is signed out and cleared');
  phase = 'complete'; report.passed = true; report.completedAt = new Date().toISOString(); await persist();
}
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'strict-origin');
  response.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${url} ${naver ? 'https://nid.naver.com' : 'https://kauth.kakao.com https://accounts.kakao.com'}; frame-ancestors 'none'`);
  if (request.headers.host !== 'localhost:3000' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) { response.writeHead(403).end(); return; }
  try {
    const target = new URL(request.url, origin);
    if (request.method === 'POST' && target.pathname === '/login') {
      assert.equal(phase, 'ready'); assert.equal(request.headers.origin, origin);
      let body = ''; for await (const chunk of request) { body += chunk; assert.ok(body.length < 512); }
      assert.equal(new URLSearchParams(body).get('csrf'), csrf);
      const address = new Promise(resolve => { navigate = resolve; });
      phase = 'authenticating'; loginTask = controller.signIn(provider);
      const destination = await Promise.race([address, loginTask.then(() => { throw new Error('OAuth startup failed'); })]);
      response.writeHead(303, { Location: destination }).end(); return;
    }
    if (request.method !== 'GET' || target.pathname !== '/') { response.writeHead(404).end(); return; }
    if (target.searchParams.has('error')) {
      browserCallback?.({ type: 'cancel' }); await loginTask;
      const code = target.searchParams.get('error');
      report.oauthError = /^[a-z_]+$/.test(code) ? code : 'unrecognized';
      report.passed = false; report.cancelled = code === 'access_denied'; phase = report.cancelled ? 'cancelled' : 'failed'; await persist();
      response.writeHead(303, { Location: '/' }).end(); return;
    }
    if (target.searchParams.has('code')) {
      assert.equal(target.searchParams.getAll('code').length, 1);
      await verify(target.searchParams.get('code'));
      response.writeHead(303, { Location: '/' }).end(); return;
    }
    const title = { ready: `${label} 연결 확인`, authenticating: `${label} 인증 진행 중`, checking: '연결 확인 중', complete: `${label} 연결 확인 완료`, cancelled: '로그인이 취소되었습니다', failed: '연결 확인 중 오류가 발생했습니다' }[phase];
    const button = phase === 'ready' ? `<form method="post" action="/login"><input type="hidden" name="csrf" value="${csrf}"><button>${label}로 연결 확인</button></form>` : '';
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>RunPen ${label} 연결</title><style>body{max-width:720px;margin:64px auto;padding:24px;font:18px/1.7 system-ui;color:#17352b;background:#f4f7f6}button{font:inherit;padding:14px 22px;border:0;border-radius:12px;background:${naver ? '#03c75a' : '#fee500'}}li{margin:10px 0}</style><h1>${title}</h1><p>RunPen ${label} 로그인과 세션 복원을 확인합니다.</p><p>처음 동의하면 기존 Google 계정과 별도로 ${label} RunPen 계정이 생성됩니다. 기존 Google 기록과 직접 설정한 프로필은 유지하며, 동의한 소셜 프로필 표시 정보를 확인합니다.</p>${button}<ul>${report.checks.map(check => `<li>✓ ${check}</li>`).join('')}</ul><p>확인 후 이 PC의 시험 세션만 종료합니다. 인증 정보는 저장하거나 표시하지 않습니다.</p></html>`);
  } catch (error) {
    const stage = phase; phase = 'failed'; report.passed = false; report.failureStage = stage; report.failureType = error?.name ?? 'Error';
    report.failureLocation = error?.stack?.split('\n').find(line => line.includes('social-hosted.mjs:'))?.trim();
    console.error(`${slug} verification failed at ${stage}: ${report.failureType}; ${report.failureLocation ?? ''}`);
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* Report remains failed. */ }
    values.clear(); await persist(); response.writeHead(303, { Location: '/' }).end();
  }
});
server.listen(3000, '127.0.0.1', () => console.log(`${slug} verifier ready: http://localhost:3000`));
setTimeout(async () => { browserCallback?.({ type: 'cancel' }); await loginTask; await client.auth.signOut({ scope: 'local' }); values.clear(); server.close(); }, 15 * 60_000).unref();
