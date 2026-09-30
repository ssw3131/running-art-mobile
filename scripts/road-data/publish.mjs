import assert from 'node:assert/strict';
import { sha256 } from './common.mjs';
import { CURRENT_KEY, MAX_MANIFEST_BYTES } from './deployment.mjs';

// Used by HTTP and the S3 adapter: bound the response before accumulating it.
export async function collectBytes(stream, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    assert.ok(size <= limit, '원격 응답 크기 초과');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function verifyObject(actual, expected) {
  assert.ok(actual, `파일 없음: ${expected.key}`);
  assert.equal(actual.body.length, expected.body.length, `크기 불일치: ${expected.key}`);
  assert.equal(sha256(actual.body), expected.sha256, `해시 불일치: ${expected.key}`);
  assert.equal(actual.contentType, expected.contentType, `Content-Type 불일치: ${expected.key}`);
  assert.equal(actual.cacheControl, expected.cacheControl, `Cache-Control 불일치: ${expected.key}`);
  assert.ok(!actual.contentEncoding || actual.contentEncoding === 'identity', `Content-Encoding 금지: ${expected.key}`);
}

export async function uploadBundle(bundle, store) {
  let uploaded = 0, reused = 0;
  for (const object of bundle.objects) {
    const existing = await store.get(object.key, object.body.length);
    if (existing) { verifyObject(existing, object); reused++; continue; }
    try { await store.put(object, { ifNoneMatch: '*' }); uploaded++; }
    catch (error) {
      if (error.status !== 412) throw error;
      // Another publisher may have won. Only identical content can be reused.
      verifyObject(await store.get(object.key, object.body.length), object); reused++;
    }
    verifyObject(await store.get(object.key, object.body.length), object);
  }
  return { uploaded, reused, currentChanged: false };
}

export async function readPublic(baseUrl, object, { allowLoopback = false, fetchImpl = fetch } = {}) {
  const base = new URL(baseUrl);
  assert.ok(base.protocol === 'https:' || (allowLoopback && base.protocol === 'http:' && base.hostname === '127.0.0.1'), 'HTTPS 필수');
  const response = await fetchImpl(new URL(object.key, base.origin + '/'), {
    redirect: 'error', headers: { 'accept-encoding': 'identity', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(30000),
  });
  try {
    assert.equal(response.status, 200, `HTTP ${response.status}: ${object.key}`);
    const encoding = response.headers.get('content-encoding');
    assert.ok(!encoding || encoding === 'identity', `Content-Encoding 금지: ${object.key}`);
    const length = response.headers.get('content-length');
    if (length !== null) assert.equal(Number(length), object.body.length, `HTTP 크기 불일치: ${object.key}`);
    const actual = { body: await collectBytes(response.body, object.body.length),
      contentType: response.headers.get('content-type'), cacheControl: response.headers.get('cache-control'), contentEncoding: encoding };
    verifyObject(actual, object);
    // A cache rule must not override no-store for the mutable pointer.
    if (object.key === CURRENT_KEY) {
      assert.ok(!['HIT', 'STALE', 'UPDATING'].includes(response.headers.get('cf-cache-status')), '현재 버전 포인터가 CDN에 캐시됨');
      assert.ok(Number(response.headers.get('age') ?? 0) === 0, '현재 버전 포인터의 Age가 0이 아님');
    }
    return { key: object.key, bytes: actual.body.length, sha256: sha256(actual.body) };
  } finally {
    if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}

export async function verifyPublic(bundle, baseUrl, options) {
  const records = [];
  for (const object of bundle.objects) records.push(await readPublic(baseUrl, object, options));
  return { objects: records.length, bytes: records.reduce((n, r) => n + r.bytes, 0), records };
}

export async function currentState(store) {
  const current = await store.get(CURRENT_KEY, MAX_MANIFEST_BYTES);
  if (!current) return { sha256: 'absent' };
  return { sha256: sha256(current.body), etag: current.etag };
}

export async function promoteBundle(bundle, store, baseUrl, expectedSha256, options) {
  assert.match(expectedSha256 ?? '', /^(absent|[a-f0-9]{64})$/, '--expect에 확인한 현재 포인터 SHA-256 또는 absent를 지정하세요.');
  const before = await currentState(store);
  assert.equal(before.sha256, expectedSha256, '현재 버전이 바뀌었습니다. 상태를 다시 확인하세요.');
  if (before.sha256 !== 'absent') assert.ok(before.etag, '조건부 갱신에 필요한 ETag 없음');
  // Both origin and public data must be complete before exposing a pointer.
  for (const object of bundle.objects) verifyObject(await store.get(object.key, object.body.length), object);
  const verification = await verifyPublic(bundle, baseUrl, options);
  const condition = before.sha256 === 'absent' ? { ifNoneMatch: '*' } : { ifMatch: before.etag };
  await store.put(bundle.current, condition);
  // Never automatically roll back on a post-write error: that can overwrite another publisher.
  try {
    verifyObject(await store.get(CURRENT_KEY, bundle.current.body.length), bundle.current);
    await readPublic(baseUrl, bundle.current, options);
  } catch (error) {
    throw new Error(`포인터 쓰기 후 검증 실패. 자동 복구하지 않았습니다. current 명령으로 상태를 확인하세요. ${error.message}`);
  }
  return { previousSha256: before.sha256, currentSha256: bundle.current.sha256,
    verifiedObjects: verification.objects, currentChanged: true };
}
