// Explicit, disposable-account-only hosted photo verification. Credentials are
// created through the Dashboard after approval; never use a real user here.
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { stripJpegMetadata } from '../../src/modules/account/photo.ts';
import { createProfilePhotoStore } from '../../src/modules/account/photo-remote.ts';
import { createWithdrawalRemote } from '../../src/modules/account/withdrawal-remote.ts';

const keepSecond = process.argv[2] === '--verify-keep-second';
assert.ok(keepSecond || process.argv[2] === '--run-disposable');
const directory = new URL('../../.cache/account-expansion/', import.meta.url);
const credentials = JSON.parse(await readFile(new URL('fixtures.private.json', directory), 'utf8'));
assert.equal(credentials.length, 2);
for (const value of credentials) assert.match(value.email, /^runpen-photo-\d+-[ab]@example\.invalid$/);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL, key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(new URL(url).hostname, 'zymfblgzpidgfjjgrino.supabase.co');
assert.ok(key);
const fetchSafe = (input, init) => fetch(input, { ...init, signal: AbortSignal.any([AbortSignal.timeout(45000), ...(init?.signal ? [init.signal] : [])]) });
const makeClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetchSafe } });
const report = { startedAt: new Date().toISOString(), checks: [], deleted: 0 };
const pass = name => { report.checks.push(name); console.log(`PASS: ${name}`); };
const accounts = [];
const photoBytes = stripJpegMetadata(new Uint8Array(await readFile(new URL('fixture.jpg', directory))));
const photo = { bytes: photoBytes, hash: createHash('sha256').update(photoBytes).digest('hex'), uri: 'fixture.jpg' };
const replacementBytes = stripJpegMetadata(new Uint8Array(await readFile(new URL('fixture-replacement.jpg', directory))));
const replacement = { bytes: replacementBytes, hash: createHash('sha256').update(replacementBytes).digest('hex'), uri: 'fixture-replacement.jpg' };
let failed = false;
let stage = 'fixture sign-in';
try {
  for (const credential of credentials) {
    const client = makeClient(), { data, error } = await client.auth.signInWithPassword(credential);
    assert.equal(error, null);
    assert.equal(data.user.email, credential.email);
    assert.ok(data.user.identities.every(identity => identity.provider === 'email'));
    accounts.push({ client, owner: data.user.id });
  }
  const [a, b] = accounts, path = `${a.owner}/${photo.hash}.jpg`;
  assert.notEqual(a.owner, b.owner);
  const bucket = a.client.storage.from('profile-photos');
  const store = createProfilePhotoStore(a.client, randomUUID);
  stage = 'initial JPEG upload and profile commit';
  await store.save(a.owner, { nickname: '사진 시험', picture: 'uploaded' }, null, null, photo);
  let refreshed = await a.client.auth.refreshSession(); assert.equal(refreshed.error, null);
  let metadata = refreshed.data.user.user_metadata;
  assert.equal(metadata.runpen_photo_path, path); assert.equal(metadata.runpen_nickname, '사진 시험');
  const download = await bucket.download(path).asStream(); assert.equal(download.error, null);
  assert.deepEqual(new Uint8Array(await new Response(download.data).arrayBuffer()), photo.bytes);
  pass('real immutable JPEG upload, profile RPC and refreshed Auth session agree');
  assert.ok((await b.client.storage.from('profile-photos').download(path)).error);
  assert.ok((await b.client.storage.from('profile-photos').upload(path, photo.bytes.buffer, { contentType: 'image/jpeg' })).error);
  assert.ok((await makeClient().storage.from('profile-photos').download(path)).error);
  pass('foreign and anonymous photo reads and foreign upload are denied');
  const signed = await bucket.createSignedUrl(path, 60); assert.equal(signed.error, null);
  assert.equal((await fetchSafe(signed.data.signedUrl)).status, 200);
  await bucket.remove([path]);
  assert.equal((await bucket.download(path)).error, null);
  pass('private signed image loads and current profile pointer prevents cleanup');
  stage = 'duplicate JPEG upload';
  await store.save(a.owner, { nickname: '사진 재시도', picture: 'uploaded' }, metadata.runpen_profile_revision, path, photo);
  refreshed = await a.client.auth.refreshSession(); assert.equal(refreshed.error, null); metadata = refreshed.data.user.user_metadata;
  pass('duplicate upload verifies server bytes and commits the edited profile');
  stage = 'replacement and stale revision conflict';
  const staleRevision = metadata.runpen_profile_revision;
  const replacementPath = `${a.owner}/${replacement.hash}.jpg`;
  await store.save(a.owner, { nickname: '사진 교체', picture: 'uploaded' }, staleRevision, path, replacement);
  refreshed = await a.client.auth.refreshSession(); assert.equal(refreshed.error, null); metadata = refreshed.data.user.user_metadata;
  assert.equal(metadata.runpen_photo_path, replacementPath);
  assert.ok((await bucket.download(path)).error);
  assert.equal((await bucket.download(replacementPath)).error, null);
  await assert.rejects(createProfilePhotoStore(a.client, randomUUID).save(a.owner, { nickname: '오래된 수정', picture: 'initials' }, staleRevision, replacementPath));
  refreshed = await a.client.auth.refreshSession(); assert.equal(refreshed.error, null);
  assert.equal(refreshed.data.user.user_metadata.runpen_nickname, '사진 교체');
  assert.equal((await bucket.download(replacementPath)).error, null);
  pass('real photo replacement deletes old bytes; stale revision cannot overwrite current profile');
  stage = 'switch to initials';
  await store.save(a.owner, { nickname: '기본 시험', picture: 'initials' }, metadata.runpen_profile_revision, replacementPath);
  refreshed = await a.client.auth.refreshSession(); assert.equal(refreshed.error, null); metadata = refreshed.data.user.user_metadata;
  assert.equal(metadata.runpen_photo_path, null); assert.ok((await bucket.download(replacementPath)).error);
  pass('switching to initials commits before removing the old Storage object');
  await store.save(a.owner, { nickname: '탈퇴 시험', picture: 'uploaded' }, metadata.runpen_profile_revision, null, photo);
} catch (error) {
  failed = true; report.failure = 'Hosted photo check failed; inspect locally without printing credentials.';
  report.stage = stage;
  report.errorType = error?.constructor?.name ?? 'Unknown';
  report.errorCode = typeof error?.code === 'string' && /^[A-Z0-9_]{1,30}$/i.test(error.code) ? error.code : undefined;
  report.httpStatus = Number(error?.statusCode ?? error?.status) || undefined;
} finally {
  // A is deleted through the real Edge function. Explicitly retained B is used
  // for Android withdrawal; a failure still attempts cleanup of both fixtures.
  for (const account of accounts.filter((_, i) => !keepSecond || failed || i === 0)) {
    try {
      const remote = createWithdrawalRemote({ url, key, fetch: fetchSafe, token: async owner => {
        assert.equal(owner, account.owner);
        const { data, error } = await account.client.auth.getSession(); assert.equal(error, null);
        assert.equal(data.session.user.id, owner); return data.session.access_token;
      } });
      const { receipt } = await remote.prepare(account.owner);
      for (let attempt = 0; attempt < 8; attempt++) {
        if (await remote.remove(account.owner, receipt) === 'deleted') break;
      }
      assert.equal(await remote.status(receipt), 'deleted'); report.deleted++;
    } catch { failed = true; report.cleanupIncomplete = true; }
  }
  if (report.deleted === credentials.length) {
    await unlink(new URL('fixtures.private.json', directory));
    pass('both disposable accounts and their photos deleted; local credentials removed');
  } else if (keepSecond && !failed && report.deleted === 1) {
    await writeFile(new URL('fixtures.private.json', directory), JSON.stringify([credentials[1]]), { mode: 0o600 });
    report.retainedForAndroid = 1;
    pass('photo-bearing fixture A deleted; only approved fixture B retained for Android verification');
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(new URL('hosted-report.json', directory), JSON.stringify(report, null, 2));
}
assert.equal(failed, false, 'See sanitized hosted-report.json; pending fixtures require cleanup before closing work');
