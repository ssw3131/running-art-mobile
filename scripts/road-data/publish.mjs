import assert from 'node:assert/strict';
import { sha256 } from './common.mjs';
import { CURRENT_KEY, MAX_MANIFEST_BYTES } from './deployment.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

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

export async function mapBounded(items, task, { concurrency = 1, onProgress } = {}) {
  assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 32, '동시 작업 수는 1~32이어야 합니다.');
  let cursor = 0, completed = 0, failure;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failure) {
      const index = cursor++;
      if (index >= items.length) break;
      try {
        results[index] = await task(items[index]);
        completed++;
        onProgress?.({ completed, total: items.length });
      } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
  return results;
}

export async function uploadBundle(bundle, store, options) {
  assert.ok((options?.concurrency ?? 1) <= 8, '업로드 동시 작업 수는 최대 8입니다.');
  let uploaded = 0, reused = 0;
  await mapBounded(bundle.objects, async input => {
    // Materialize a validated lazy body once per bounded worker. Repeated
    // header/hash checks share this immutable snapshot instead of rereading disk.
    const object = { ...input };
    const existing = await store.get(object.key, object.body.length);
    if (existing) { verifyObject(existing, object); reused++; return; }
    try { await store.put(object, { ifNoneMatch: '*' }); uploaded++; }
    catch (error) {
      if (error.status !== 412) throw error;
      // Another publisher may have won. Only identical content can be reused.
      verifyObject(await store.get(object.key, object.body.length), object); reused++;
    }
    verifyObject(await store.get(object.key, object.body.length), object);
  }, options);
  return { uploaded, reused, currentChanged: false };
}

export async function readPublic(baseUrl, object, options = {}) {
  const retries = options.networkRetries ?? 0;
  assert.ok(Number.isInteger(retries) && retries >= 0 && retries <= 3);
  for (let attempt = 0; ; attempt++) {
    try { return await readPublicOnce(baseUrl, object, options); }
    catch (error) {
      // Retry the complete bounded GET after connection/body interruption. A
      // hash, size, MIME, cache-header or HTTP-status assertion is never retried.
      const transient = error?.name === 'TimeoutError' ||
        (error instanceof TypeError && ['fetch failed', 'terminated'].includes(error.message));
      if (!transient || attempt >= retries) throw error;
      const waitMs = 1000 * 2 ** attempt;
      options.onNetworkRetry?.({ key: object.key, attempt: attempt + 1, waitMs,
        reason: error.cause?.code ?? error.name });
      await (options.networkRetrySleep ?? sleep)(waitMs);
    }
  }
}

async function readPublicOnce(baseUrl, object, { allowLoopback = false, fetchImpl = fetch, fetchHandlesTimeout = false } = {}) {
  const base = new URL(baseUrl);
  assert.ok(base.protocol === 'https:' || (allowLoopback && base.protocol === 'http:' && base.hostname === '127.0.0.1'), 'HTTPS 필수');
  const response = await fetchImpl(new URL(object.key, base.origin + '/'), {
    redirect: 'error', headers: { 'accept-encoding': 'identity', 'cache-control': 'no-cache' },
    signal: fetchHandlesTimeout ? undefined : AbortSignal.timeout(30000),
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
    if (object.key.endsWith('/current.json')) {
      assert.ok(!['HIT', 'STALE', 'UPDATING'].includes(response.headers.get('cf-cache-status')), '현재 버전 포인터가 CDN에 캐시됨');
      assert.ok(Number(response.headers.get('age') ?? 0) === 0, '현재 버전 포인터의 Age가 0이 아님');
    }
    return { key: object.key, bytes: actual.body.length, sha256: sha256(actual.body) };
  } finally {
    if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}

export async function verifyPublic(bundle, baseUrl, options) {
  const records = await mapBounded(bundle.objects, object => readPublic(baseUrl, { ...object }, options), options);
  return { objects: records.length, bytes: records.reduce((n, r) => n + r.bytes, 0), records };
}

export async function currentState(store, key = CURRENT_KEY) {
  const current = await store.get(key, MAX_MANIFEST_BYTES);
  if (!current) return { sha256: 'absent' };
  return { sha256: sha256(current.body), etag: current.etag };
}

export async function promoteBundle(bundle, store, baseUrl, expectedSha256, options) {
  assert.match(expectedSha256 ?? '', /^(absent|[a-f0-9]{64})$/, '--expect에 확인한 현재 포인터 SHA-256 또는 absent를 지정하세요.');
  const before = await currentState(store, bundle.current.key);
  assert.equal(before.sha256, expectedSha256, '현재 버전이 바뀌었습니다. 상태를 다시 확인하세요.');
  if (before.sha256 !== 'absent') assert.ok(before.etag, '조건부 갱신에 필요한 ETag 없음');
  // Both origin and public data must be complete before exposing a pointer.
  const verified = await mapBounded(bundle.objects, async input => {
    const object = { ...input };
    // Independent reads can overlap, but both must settle before this worker
    // finishes, including on failure. No pointer is written on partial success.
    const [origin, publicObject] = await Promise.allSettled([
      (async () => verifyObject(await store.get(object.key, object.body.length), object))(),
      readPublic(baseUrl, object, options),
    ]);
    if (origin.status === 'rejected') throw origin.reason;
    if (publicObject.status === 'rejected') throw publicObject.reason;
    return publicObject.value;
  }, { ...options, onProgress: progress => options?.onProgress?.({ ...progress, phase: 'origin-and-public' }) });
  const condition = before.sha256 === 'absent' ? { ifNoneMatch: '*' } : { ifMatch: before.etag };
  await store.put(bundle.current, condition);
  // Never automatically roll back on a post-write error: that can overwrite another publisher.
  try {
    verifyObject(await store.get(bundle.current.key, bundle.current.body.length), bundle.current);
    await readPublic(baseUrl, bundle.current, options);
  } catch (error) {
    throw new Error(`포인터 쓰기 후 검증 실패. 자동 복구하지 않았습니다. current 명령으로 상태를 확인하세요. ${error.message}`);
  }
  return { previousSha256: before.sha256, currentSha256: bundle.current.sha256,
    verifiedObjects: verified.length, currentChanged: true };
}
