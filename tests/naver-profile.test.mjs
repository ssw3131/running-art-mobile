import assert from 'node:assert/strict';
import test from 'node:test';
import { naverProfileMetadata, syncNaverProfile } from '../src/modules/auth/naver-profile.ts';
import { createAuthController } from '../src/modules/auth/controller.ts';
import { AUTH_PENDING_KEY, AUTH_REDIRECT_URL } from '../src/modules/auth/config.ts';

const user = { id: 'naver-owner', user_metadata: {}, identities: [{ provider: 'custom:naver', identity_data: { sub: 'naver-subject' } }] };
const payload = { resultcode: '00', response: { id: 'naver-subject', nickname: '  네이버 러너  ', profile_image: 'https://ssl.pstatic.net/fixture.png', email: 'unused@example.invalid' } };
function fixture(metadata = {}) {
  let session = { user: { ...user, user_metadata: metadata }, provider_token: 'fixture-provider-token' }, event;
  const writes = [], storageValues = new Map();
  const storage = { getItem: async key => storageValues.get(key) ?? null, setItem: async (key, value) => storageValues.set(key, value), removeItem: async key => storageValues.delete(key) };
  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    updateUser: async ({ data }) => { writes.push(data); session = { ...session, user: { ...session.user, user_metadata: { ...session.user.user_metadata, ...data } } }; event?.('USER_UPDATED', session); return { data: { user: session.user }, error: null }; },
    onAuthStateChange: cb => { event = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    exchangeCodeForSession: async () => ({ data: { session }, error: null }),
  };
  return { auth, storage, writes, session: () => session, replace: value => { session = value; }, emit: () => event?.('SIGNED_IN', session) };
}

test('Naver nested response binds the subject and keeps only consented display fields', () => {
  assert.deepEqual(naverProfileMetadata(payload, 'naver-subject'), { runpen_naver_nickname: '네이버 러너', runpen_naver_avatar_url: 'https://ssl.pstatic.net/fixture.png' });
  for (const value of [null, {}, { ...payload, resultcode: '024' }, { ...payload, response: { ...payload.response, id: 'other' } }]) assert.throws(() => naverProfileMetadata(value, 'naver-subject'));
  for (const nickname of ['', '  ', '\n', 'hidden\u200b', 'a'.repeat(201)]) assert.throws(() => naverProfileMetadata({ ...payload, response: { ...payload.response, nickname } }, 'naver-subject'));
  for (const profile_image of [undefined, 'http://arbitrary.invalid/photo', 'https://user:pass@example.invalid/photo']) assert.equal(naverProfileMetadata({ ...payload, response: { ...payload.response, profile_image } }, 'naver-subject').runpen_naver_avatar_url, null);
});

test('Naver enrichment preserves custom profile and survives a new app controller without provider token', async () => {
  const custom = { runpen_nickname: '내 별명', runpen_picture: 'initials', runpen_photo_path: 'unchanged', runpen_profile_revision: 'revision', unrelated: true };
  const f = fixture(custom);
  const restored = await syncNaverProfile(f.auth, f.session(), async (url, options) => {
    assert.equal(url, 'https://openapi.naver.com/v1/nid/me');
    assert.equal(options.headers.Authorization, 'Bearer fixture-provider-token');
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return Response.json(payload);
  });
  for (const [key, value] of Object.entries(custom)) assert.equal(restored.user.user_metadata[key], value);
  assert.deepEqual(Object.keys(f.writes[0]).sort(), ['runpen_naver_avatar_url', 'runpen_naver_nickname']);
  f.replace({ ...restored, provider_token: undefined });
  const controller = createAuthController({ auth: f.auth, storage: f.storage, openBrowser: async () => ({ type: 'cancel' }) });
  await controller.start();
  assert.equal(controller.getSnapshot().account.name, '내 별명');
  assert.equal(controller.getSnapshot().account.picture, 'initials');
  assert.equal(controller.getSnapshot().account.avatarUrl, 'https://ssl.pstatic.net/fixture.png');
});

test('Naver mismatch, provider failure and account change cannot write a profile', async () => {
  for (const mode of ['identity', 'http', 'network', 'account']) {
    const f = fixture();
    await assert.rejects(syncNaverProfile(f.auth, f.session(), async () => {
      if (mode === 'network') throw new Error('Offline');
      if (mode === 'http') return new Response('', { status: 401 });
      if (mode === 'account') f.replace({ user: { ...user, id: 'other-owner' } });
      return Response.json(mode === 'identity' ? { ...payload, response: { ...payload.response, id: 'other' } } : payload);
    }));
    assert.deepEqual(f.writes, []);
  }
});

test('Naver optional photo revocation clears the old provider photo only', async () => {
  const f = fixture({ runpen_naver_avatar_url: 'https://old.invalid/photo', avatar_url: 'https://old.invalid/fallback', runpen_picture: 'provider' });
  await syncNaverProfile(f.auth, f.session(), async () => Response.json({ ...payload, response: { id: 'naver-subject', nickname: '러너' } }));
  const controller = createAuthController({ auth: f.auth, storage: f.storage, openBrowser: async () => ({ type: 'cancel' }) });
  await controller.start();
  assert.equal(controller.getSnapshot().account.avatarUrl, null);
  assert.equal(controller.getSnapshot().account.name, '러너');
  assert.equal(f.session().user.user_metadata.avatar_url, 'https://old.invalid/fallback');
});

test('Naver callback enriches before success; profile failure keeps the authenticated account with a clear warning', async () => {
  for (const fail of [false, true]) {
    const f = fixture();
    const controller = createAuthController({ auth: f.auth, storage: f.storage, providers: ['custom:naver'], now: () => 10,
      fetchProviderProfile: async () => fail ? new Response('', { status: 503 }) : Response.json(payload), openBrowser: async () => ({ type: 'cancel' }) });
    await f.storage.setItem(AUTH_PENDING_KEY, JSON.stringify({ createdAt: 1, provider: 'custom:naver' }));
    await controller.handleUrl(`${AUTH_REDIRECT_URL}?code=fixture`);
    assert.equal(controller.getSnapshot().account.id, 'naver-owner');
    assert.equal(controller.getSnapshot().account.name, fail ? '러너' : '네이버 러너');
    assert.equal(controller.getSnapshot().busy, false);
    assert.equal(await f.storage.getItem(AUTH_PENDING_KEY), null);
    if (fail) assert.match(controller.getSnapshot().message, /로그인되었습니다.*프로필을 불러오지 못/);
    else assert.equal(controller.getSnapshot().message, '네이버 로그인되었습니다.');
  }
});
