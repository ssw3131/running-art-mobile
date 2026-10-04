// Loopback-only Google OAuth verification of the production profile controller.
// Never reads browser cookies/storage or handles Google passwords. Tokens stay
// in this process; only the pre-test metadata backup is written to ignored cache.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createAuthController } from '../../src/modules/auth/controller.ts';

assert.ok(['--verify-google', '--observe-phone'].includes(process.argv[2]), 'Explicit Google profile verification required');
const observePhone = process.argv[2] === '--observe-phone';
const directory = new URL('../../.cache/account-hosted-qa/', import.meta.url);
const config = JSON.parse(await readFile(new URL('google.private.json', directory), 'utf8'));
assert.match(config.owner, /^[0-9a-f-]{36}$/); assert.ok(config.email);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL, key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(new URL(url).hostname, 'zymfblgzpidgfjjgrino.supabase.co');
const origin = 'http://localhost:3000', csrf = randomBytes(24).toString('hex');
const values = new Map(), storage = {
  getItem: async name => values.get(name) ?? null,
  setItem: async (name, value) => { values.set(name, value); },
  removeItem: async name => { values.delete(name); },
};
const report = { startedAt: new Date().toISOString(), checks: [], scope: observePhone ? 'Observe actual phone profile writes with a separate Google OAuth session, then restore original metadata' : 'Real Google OAuth and Supabase metadata using app profile controller; SDK memory storage recreation; no Android UI or native SecureStore test' };
const pass = name => { report.checks.push(name); console.log(`PASS: ${name}`); };
const persist = () => writeFile(new URL(observePhone ? 'phone-profile-result.json' : 'profile-result.json', directory), JSON.stringify(report, null, 2));
const sha = object => createHash('sha256').update(JSON.stringify(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
let client, controller, phase = 'ready', flowId, original, changed = false, locked = false, stage = 'ready';
const testProfile = { nickname: 'RunPen 검증🏃', picture: 'initials' };
function create() {
  client = createClient(url, key, { auth: { flowType: 'pkce', storage, storageKey: 'runpen-profile-qa', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(45000) }) } });
  controller = createAuthController({ auth: client.auth, storage, openBrowser: async () => ({ type: 'cancel' }) });
}
async function currentUser() {
  const { data, error } = await client.auth.getUser();
  assert.equal(error, null); assert.equal(data.user.id, config.owner);
  assert.ok(data.user.identities.some(identity => identity.provider === 'google'));
  return data.user;
}
async function restore() {
  if (!original || !changed) return;
  await currentUser();
  const { error } = await client.auth.updateUser({ data: { runpen_nickname: original.runpen_nickname ?? null, runpen_picture: original.runpen_picture ?? null } });
  assert.equal(error, null);
  const restored = (await currentUser()).user_metadata;
  assert.deepEqual(restored, original, 'All original profile metadata restored exactly');
  changed = false; report.restoredMetadataSha256 = sha(restored);
  pass('original Google profile metadata restored exactly, including absent RunPen keys');
}
function page() {
  const labels = { ready: 'Google 로그인 · 프로필 시험', relogin: 'Google 재로그인 · 유지 확인', observing: '휴대폰의 프로필 저장 결과 확인', failed: '검증 중 오류: 로컬 결과를 확인하세요.', complete: '프로필 검증 완료 · 원래 값 복구 완료', authenticating: 'Google 인증을 진행 중입니다.' };
  const form = (action, text) => `<form method="post" action="${action}"><input type="hidden" name="csrf" value="${csrf}"><button>${text}</button></form>`;
  const button = ['ready', 'relogin'].includes(phase) ? form('/login', labels[phase]) : phase === 'observing' ? form('/verify-phone', '휴대폰 저장 서버 대조') + form('/restore-phone', '원래 프로필 복구') : '';
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>RunPen 프로필 서버 검증</title><style>body{max-width:780px;margin:60px auto;padding:24px;font:18px/1.7 system-ui;background:#f4f7f6;color:#17352b}button{font:inherit;padding:16px 22px;background:#146b50;color:white;border:0;border-radius:10px}li{margin:12px 0}</style><h1>RunPen 프로필 서버 검증</h1><p>${labels[phase]}</p><p>기존 Google 계정으로 저장·세션 복원·재로그인을 확인하고 프로필을 원래대로 복구합니다.</p>${button}<ul>${report.checks.map(text => `<li>✓ ${text}</li>`).join('')}</ul><p>휴대폰 설치나 계정 탈퇴는 수행하지 않습니다. 인증 정보는 화면에 표시하지 않습니다.</p></html>`;
}
async function callback(code) {
  assert.equal(phase, 'authenticating');
  const { error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  assert.equal(error, null);
  const user = await currentUser(); await controller.start();
  assert.equal(controller.getSnapshot().account.id, config.owner);
  if (!original) {
    original = structuredClone(user.user_metadata);
    await writeFile(new URL('profile-original.private.json', directory), JSON.stringify({ owner: config.owner, metadata: original }), { flag: 'wx' });
    report.originalMetadataSha256 = sha(original);
    pass('existing Google owner confirmed through real OAuth');
    if (observePhone) { changed = true; phase = 'observing'; await persist(); return; }
    assert.equal(await controller.saveProfile({ nickname: ' ', picture: 'initials' }), false);
    assert.deepEqual((await currentUser()).user_metadata, original);
    pass('invalid blank nickname rejected without changing the live profile');
    changed = true; // A lost update response must still trigger restoration.
    assert.equal(await controller.saveProfile({ ...testProfile, nickname: `  ${testProfile.nickname}  ` }), true);
    assert.equal(controller.getSnapshot().account.name, testProfile.nickname);
    const saved = (await currentUser()).user_metadata;
    assert.equal(saved.runpen_nickname, testProfile.nickname); assert.equal(saved.runpen_picture, testProfile.picture);
    const beforeOthers = { ...original }, afterOthers = { ...saved };
    for (const k of ['runpen_nickname', 'runpen_picture']) { delete beforeOthers[k]; delete afterOthers[k]; }
    assert.deepEqual(afterOthers, beforeOthers);
    pass('app saveProfile stores normalized Korean/emoji nickname and initials mode on live Auth');
    await client.auth.stopAutoRefresh(); create(); await controller.start();
    assert.equal(controller.getSnapshot().account.name, testProfile.nickname);
    assert.equal(controller.getSnapshot().account.picture, testProfile.picture);
    assert.equal((await currentUser()).user_metadata.runpen_nickname, testProfile.nickname);
    pass('fresh SDK and app controller restore the saved profile from the stored session');
    await controller.signOut(); assert.equal(controller.getSnapshot().account, null);
    assert.equal((await client.auth.getSession()).data.session, null);
    pass('QA session signs out locally; phone sessions are not globally revoked');
    create(); phase = 'relogin';
  } else {
    assert.equal(user.user_metadata.runpen_nickname, testProfile.nickname); assert.equal(user.user_metadata.runpen_picture, testProfile.picture);
    assert.equal(controller.getSnapshot().account.name, testProfile.nickname);
    assert.equal(controller.getSnapshot().account.picture, testProfile.picture);
    pass('a second Google OAuth login preserves both edited profile fields');
    await restore();
    await controller.signOut(); assert.equal((await client.auth.getSession()).data.session, null);
    values.clear(); report.passed = true; report.completedAt = new Date().toISOString(); phase = 'complete';
    pass('temporary QA session cleared after successful restoration');
  }
  await persist();
}
create();
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'strict-origin');
  response.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${url} https://accounts.google.com; frame-ancestors 'none'`);
  if (request.headers.host !== 'localhost:3000' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) { response.writeHead(403).end(); return; }
  try {
    const target = new URL(request.url, origin);
    if (request.method === 'POST' && ['/login', '/verify-phone', '/restore-phone'].includes(target.pathname)) {
      stage = 'validate local login request';
      assert.equal(request.headers.origin, origin);
      let body = ''; for await (const chunk of request) { body += chunk; assert.ok(body.length < 512); }
      assert.equal(new URLSearchParams(body).get('csrf'), csrf);
      if (target.pathname !== '/login') {
        assert.ok(observePhone && phase === 'observing');
        const metadata = (await currentUser()).user_metadata;
        if (target.pathname === '/verify-phone') {
          assert.equal(metadata.runpen_nickname, 'RunPenPhoneQA'); assert.equal(metadata.runpen_picture, 'initials');
          report.phoneSaveVerified = true;
          pass('physical phone nickname and initials selection match fresh live Auth response');
        } else {
          changed = true; await restore();
          await controller.signOut(); assert.equal((await client.auth.getSession()).data.session, null);
          values.clear(); phase = 'complete'; report.passed = !!report.phoneSaveVerified; report.completedAt = new Date().toISOString();
        }
        await persist(); response.writeHead(303, { Location: '/' }).end(); return;
      }
      assert.ok(['ready', 'relogin'].includes(phase));
      stage = 'create OAuth request';
      const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: origin, skipBrowserRedirect: true, queryParams: { prompt: 'select_account', login_hint: config.email } } });
      assert.equal(error, null); assert.equal(new URL(data.url).searchParams.get('code_challenge_method'), 's256');
      flowId = data.flowId; phase = 'authenticating';
      response.writeHead(303, { Location: data.url }).end(); return;
    }
    if (request.method === 'GET' && target.pathname === '/' && target.searchParams.has('code')) {
      stage = 'exchange OAuth callback and verify profile';
      assert.equal(locked, false); locked = true;
      try { await callback(target.searchParams.get('code')); } finally { locked = false; }
      response.writeHead(303, { Location: '/' }).end(); return;
    }
    if (target.pathname !== '/' || request.method !== 'GET') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page());
  } catch (error) {
    report.passed = false; report.failure = error?.name ?? 'Error'; report.failedStage = stage;
    report.failureLocation = error?.stack?.split('\n').find(line => line.includes('profile-hosted.mjs:'))?.trim(); phase = 'failed';
    console.error(`Profile verification failed (${report.failure}); attempting original-value restoration.`);
    try { await restore(); } catch { report.restoreRequired = true; console.error('Profile restoration requires follow-up with the same Google account.'); }
    await persist(); response.writeHead(303, { Location: '/' }).end();
  }
});
server.listen(3000, '127.0.0.1', () => console.log('Google profile verifier ready: http://localhost:3000'));
