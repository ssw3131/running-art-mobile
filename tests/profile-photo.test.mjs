import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { stripJpegMetadata, profilePhotoPath, PROFILE_PHOTO_MAX_BYTES } from '../src/modules/account/photo.ts';
import { createProfilePhotoStore } from '../src/modules/account/photo-remote.ts';
import { createAuthController } from '../src/modules/auth/controller.ts';

const owner = '33333333-3333-4333-8333-333333333333', mutation = '55555555-5555-4555-8555-555555555555';
const segment = (marker, payload) => [255, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
const frame = segment(192, [8, 0, 8, 0, 8, 1, 1, 17, 0]);
const scan = [...segment(218, [1, 1, 0, 0, 63, 0]), 10, 20, 255, 0, 30, 255, 208, 40];
const jpg = Uint8Array.from([255, 216, ...frame, ...scan, 255, 217]);
const hash = bytesToHex(sha256(jpg));
const path = `${owner}/${hash}.jpg`, oldPath = `${owner}/${'a'.repeat(64)}.jpg`;
const photo = { bytes: jpg, hash, mutationId: mutation, uri: 'file:///fixture.jpg' };

test('JPEG strips EXIF/GPS, XMP, IPTC, comments and trailing data while preserving image segments', () => {
  const metadata = new TextEncoder().encode('Exif\0\0 GPS private location');
  const input = Uint8Array.from([255, 216, ...segment(225, metadata), ...frame, ...segment(237, metadata), ...segment(254, metadata), ...scan, 255, 217, ...metadata]);
  assert.deepEqual(stripJpegMetadata(input), jpg);
  assert.deepEqual(stripJpegMetadata(jpg), jpg);
});

test('corrupt, oversized, non-image and over-dimension JPEG input is rejected', () => {
  const hugeFrame = segment(192, [8, 4, 0, 4, 0, 1, 1, 17, 0]);
  for (const input of [new Uint8Array(), new Uint8Array(PROFILE_PHOTO_MAX_BYTES + 1), jpg.slice(0, -1), Uint8Array.from([255, 216, 255, 217]), Uint8Array.from([255, 216, ...hugeFrame, ...scan, 255, 217]), Uint8Array.from([255, 216, 255, 225, 255, 255])]) assert.throws(() => stripJpegMetadata(input));
  assert.equal(profilePhotoPath(owner, path), path);
  for (const invalid of [oldPath.replace(owner, '44444444-4444-4444-8444-444444444444'), `${owner}/../photo.jpg`, `https://example.test/${path}`, null]) assert.equal(profilePhotoPath(owner, invalid), null);
});

function remoteFixture(options = {}) {
  const calls = [];
  const client = createClient('https://example.supabase.co', 'test-public-key', { accessToken: async () => 'test-token', global: { fetch: async (input, init) => {
    const url = new URL(input), body = init.body;
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer test-token');
    if (url.pathname === `/storage/v1/object/profile-photos/${path}` && init.method === 'POST') {
      calls.push('upload'); assert.ok(body instanceof ArrayBuffer); assert.deepEqual(new Uint8Array(body), jpg);
      assert.equal(new Headers(init.headers).get('x-upsert'), 'false');
      return options.uploadFails ? Response.json({ message: 'offline', statusCode: '500' }, {status:500}) : options.duplicate ? Response.json({message:'exists',statusCode:'409'}, {status:409}) : Response.json({Key:path});
    }
    if (url.pathname === `/storage/v1/object/authenticated/profile-photos/${path}` || url.pathname === `/storage/v1/object/profile-photos/${path}`) {
      calls.push('download'); return new Response(options.corrupt ? new Uint8Array([1,2,3]) : jpg, {headers:{'Content-Type':'image/jpeg'}});
    }
    if (url.pathname === '/rest/v1/rpc/save_account_profile') {
      calls.push('commit'); const value = JSON.parse(body);
      assert.equal(value.p_owner, owner); assert.equal(value.p_nickname, '러너'); assert.equal(value.p_photo_path, path); assert.equal(value.p_expected_revision, null); assert.equal(value.p_mutation_id, mutation);
      if (options.commitFails) throw new Error('unknown response');
      return Response.json(options.conflict ? {outcome:'conflict'} : {outcome:'applied',revision:mutation});
    }
    if (url.pathname === '/storage/v1/object/profile-photos') {
      calls.push('remove'); assert.deepEqual(JSON.parse(body), {prefixes:[oldPath]}); return Response.json([]);
    }
    if (url.pathname === '/storage/v1/object/list/profile-photos') { calls.push('list'); assert.equal(JSON.parse(body).prefix, owner); return Response.json([]); }
    throw new Error(`Unexpected ${url.pathname}`);
  } } });
  return { store: createProfilePhotoStore(client, () => mutation), calls };
}

test('SDK uploads JPEG ArrayBuffer, commits the profile and only then cleans the replaced file', async () => {
  for (const duplicate of [false, true]) {
    const f = remoteFixture({duplicate});
    await f.store.save(owner, {nickname:' 러너 ',picture:'uploaded'}, null, oldPath, photo);
    assert.deepEqual(f.calls, duplicate ? ['upload','download','commit','remove','list'] : ['upload','commit','remove','list']);
  }
});

test('failed upload, lost commit response or conflict never cleans a possibly live image', async () => {
  for (const options of [{uploadFails:true}, {commitFails:true}, {conflict:true}, {duplicate:true,corrupt:true}]) {
    const f = remoteFixture(options);
    await assert.rejects(f.store.save(owner, {nickname:'러너',picture:'uploaded'}, null, oldPath, photo));
    assert.ok(!f.calls.includes('remove')); assert.ok(!f.calls.includes('list'));
  }
  const f = remoteFixture();
  await assert.rejects(f.store.save(owner, {nickname:'러너',picture:'uploaded'}, null, null, {...photo, hash:'a'.repeat(64)}));
  assert.deepEqual(f.calls, []);
});

test('photo profile save refreshes persisted Auth metadata and serializes account actions', async () => {
  let metadata = { full_name: '원래', unrelated: 'keep' }, listener, release;
  const gate = new Promise(resolve => { release = resolve; });
  const session = () => ({ user: { id: owner, user_metadata: metadata, identities:[{provider:'kakao'}] } });
  let logout = 0;
  const auth = { getSession: async () => ({data:{session:session()},error:null}), onAuthStateChange: cb => {listener = cb;},
    refreshSession: async () => {const s = session(); listener('TOKEN_REFRESHED',s); return {data:{session:s,user:s.user},error:null};},
    signOut: async () => {logout++;} };
  const controller = createAuthController({auth,storage:{removeItem:async()=>{}},openBrowser:async()=>({type:'cancel'}),
    profilePhotos:{save:async(actor,input,revision,current,bytes)=>{assert.equal(actor,owner); assert.equal(current,null); assert.equal(bytes,photo); await gate; metadata={...metadata,runpen_nickname:input.nickname,runpen_picture:input.picture,runpen_photo_path:path,runpen_profile_revision:mutation};}}});
  await controller.start(); const saving = controller.saveProfile({nickname:'사진 러너',picture:'uploaded'},photo);
  await controller.signOut(); assert.equal(logout,0);
  assert.equal(await controller.saveProfile({nickname:'중복',picture:'initials'}),false);
  release(); assert.equal(await saving,true);
  assert.equal(controller.getSnapshot().account.photoPath,path); assert.equal(controller.getSnapshot().account.picture,'uploaded');
  assert.equal(metadata.full_name,'원래'); assert.equal(metadata.unrelated,'keep');
});

test('unknown outcome retries the same mutation, while an edited nickname gets a new mutation', async () => {
  const requests = []; let sequence = 0;
  const store = createProfilePhotoStore({storage:{from:()=>({})},rpc:async(_name, input)=>{requests.push(input); throw new Error('lost response');}},()=>`mutation-${++sequence}`);
  await assert.rejects(store.save(owner,{nickname:'첫 저장',picture:'uploaded'},null,path));
  await assert.rejects(store.save(owner,{nickname:'첫 저장',picture:'uploaded'},null,path));
  await assert.rejects(store.save(owner,{nickname:'수정한 저장',picture:'uploaded'},null,path));
  assert.equal(requests[0].p_mutation_id,requests[1].p_mutation_id);
  assert.notEqual(requests[1].p_mutation_id,requests[2].p_mutation_id);
});
