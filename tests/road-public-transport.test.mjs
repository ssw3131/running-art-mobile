import test from 'node:test';
import assert from 'node:assert/strict';
import { createPacedPublicFetch } from '../scripts/road-data/public-transport.mjs';
import { readPublic } from '../scripts/road-data/publish.mjs';
import { sha256 } from '../scripts/road-data/common.mjs';
import { setImmediate as nextTurn } from 'node:timers/promises';

test('public verification requests share one start-rate gate even with concurrent workers', async () => {
  const starts = []; let now = 1000;
  const fetcher = createPacedPublicFetch({ intervalMs: 20, now: () => now, sleep: async ms => { now += ms; }, fetchImpl: async (_url, init) => {
    assert.ok(init.signal instanceof AbortSignal);
    starts.push(now); return new Response('ok');
  } });
  await Promise.all(Array.from({ length: 5 }, () => fetcher('https://example.test')));
  assert.deepEqual(starts, [1000, 1020, 1040, 1060, 1080]);
});
test('429 honors Retry-After and retries the same URL, but does not retry other HTTP errors', async () => {
  let now = 1000, calls = 0; const waits = [], urls = [], events = [];
  const fetcher = createPacedPublicFetch({ now: () => now, sleep: async ms => { waits.push(ms); now += ms; },
    retryDelayMs: 10, onThrottle: event => events.push(event), fetchImpl: async url => {
      calls++; urls.push(url);
      return calls === 1 ? new Response(null, { status: 429, headers: { 'retry-after': '2' } }) : new Response('ok');
    } });
  assert.equal((await fetcher('https://example.test/object')).status, 200);
  assert.deepEqual(urls, ['https://example.test/object', 'https://example.test/object']);
  assert.equal(events[0].waitMs, 2000); assert.ok(waits.includes(2000));
  let failures = 0;
  const missing = createPacedPublicFetch({ fetchImpl: async () => { failures++; return new Response(null, { status: 404 }); } });
  assert.equal((await missing('https://example.test/missing')).status, 404); assert.equal(failures, 1);
});
test('a 429 pauses all queued workers rather than retrying only the rejected request', async () => {
  const starts = [], waiting = [], throttled = []; let now = 1000;
  const fetcher = createPacedPublicFetch({ intervalMs: 1, retryDelayMs: 30, now: () => now,
    sleep: ms => new Promise(resolve => waiting.push({ at: now + ms, resolve })),
    onThrottle: () => throttled.push(now), fetchImpl: async () => {
    starts.push(now);
    return new Response(null, { status: starts.length === 1 ? 429 : 200 });
  } });
  const pending = Promise.all(Array.from({ length: 5 }, () => fetcher('https://example.test')));
  await nextTurn(); assert.deepEqual(throttled, [1000]);
  async function advance(value) {
    now = value;
    for (const timer of waiting.filter(timer => timer.at <= now)) {
      waiting.splice(waiting.indexOf(timer), 1); timer.resolve();
    }
    await nextTurn();
  }
  await advance(1029); assert.deepEqual(starts, [1000]);
  for (let value = 1030; value <= 1036; value++) await advance(value);
  await pending;
  assert.equal(starts.length, 6); assert.ok(starts.slice(1).every(at => at >= 1030));
});
test('retry exhaustion and long Retry-After stop without an early retry; cancellation prevents a request', async () => {
  let now = 0, calls = 0;
  const fetcher = createPacedPublicFetch({ now: () => now, sleep: async ms => { now += ms; }, retryDelayMs: 1,
    fetchImpl: async () => { calls++; return new Response(null, { status: 429 }); } });
  await assert.rejects(fetcher('https://example.test'), /HTTP 429/); assert.equal(calls, 4);
  let longCalls = 0;
  const long = createPacedPublicFetch({ fetchImpl: async () => { longCalls++; return new Response(null, { status: 429, headers: { 'retry-after': '120' } }); } });
  await assert.rejects(long('https://example.test'), /HTTP 429/); assert.equal(longCalls, 1);
  const aborted = new AbortController(); aborted.abort(new Error('cancelled'));
  await assert.rejects(long('https://example.test', { signal: aborted.signal }), /cancelled/); assert.equal(longCalls, 1);
});
test('connection and body interruptions retry the full validated object, but corrupt content does not retry', async () => {
  const body = Buffer.from('complete object'), expected = { key: 'object.json', body, sha256: sha256(body),
    contentType: 'application/json', cacheControl: 'no-store' };
  const headers = { 'content-type': expected.contentType, 'cache-control': expected.cacheControl };
  const waits = []; let calls = 0;
  const options = { networkRetries: 3, networkRetrySleep: async ms => { waits.push(ms); }, fetchImpl: async () => {
    calls++;
    if (calls === 1) throw new TypeError('fetch failed');
    if (calls === 2) return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('terminated')); } }), { headers });
    return new Response(body, { headers });
  } };
  assert.equal((await readPublic('https://example.test', expected, options)).sha256, expected.sha256);
  assert.equal(calls, 3); assert.deepEqual(waits, [1000, 2000]);
  calls = 0;
  await assert.rejects(readPublic('https://example.test', expected, { ...options, fetchImpl: async () => {
    calls++; return new Response(Buffer.alloc(body.length), { headers });
  } }), /해시 불일치/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(readPublic('https://example.test', expected, { ...options, fetchImpl: async () => {
    calls++; throw new TypeError('fetch failed');
  } }), /fetch failed/);
  assert.equal(calls, 4);
});
