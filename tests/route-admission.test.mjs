import { usageFixture, usageHeaders } from './helpers/usage.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAdmissionGuard, emptyAdmissionState, createIngressGate } from '../server/route-compute/admission.mjs';
import { createGcsAdmissionStore, createMetadataTokenProvider } from '../server/route-compute/admission-store.mjs';
import { createComputeServer } from '../server/route-compute/server.mjs';
import { COMPUTE_CONTRACT } from '../src/modules/route-compute/contract.ts';

const signal = () => new AbortController().signal;
function memoryStore() {
  let state = emptyAdmissionState(), generation = 1, reads = 0, writes = 0;
  return {
    read: async () => { reads++; return { state: structuredClone(state), generation: String(generation) }; },
    compareAndSwap: async (expected, next) => {
      if (expected !== String(generation)) return false;
      state = structuredClone(next); generation++; writes++; return true;
    },
    get state() { return state; }, get reads() { return reads; }, get writes() { return writes; },
  };
}

test('two instances racing for final reservation cannot overspend; restart retains limit', async () => {
  const store = memoryStore(), limits = { minute: 1, hour: 9, day: 9, month: 9 };
  const make = () => createAdmissionGuard({ store, limits, now: () => Date.UTC(2026, 9, 10, 1, 2, 3) });
  const results = await Promise.allSettled([make().reserve(signal()), make().reserve(signal())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'limit_minute');
  await assert.rejects(make().reserve(signal()), e => e.status === 429 && e.retryAfter === 57);
  assert.equal(store.writes, 1);
});

test('longest exhausted period controls Retry-After, UTC windows expire independently', async () => {
  const store = memoryStore(); let current = Date.UTC(2026, 9, 31, 23, 59, 58);
  const limits = { minute: 2, hour: 2, day: 2, month: 2 };
  const guard = createAdmissionGuard({ store, limits, now: () => current });
  await guard.reserve(signal()); await guard.reserve(signal());
  await assert.rejects(guard.reserve(signal()), e => e.code === 'limit_month' && e.retryAfter === 2);
  const reads = store.reads;
  await assert.rejects(guard.reserve(signal())); assert.equal(store.reads, reads);
  current += 2001; await guard.reserve(signal());
  for (const window of Object.values(store.state.windows)) assert.equal(window.count, 1);
});

test('hour/day/month limits survive shorter period resets and backwards clocks', async () => {
  for (const period of ['hour', 'day', 'month']) {
    const store = memoryStore(); let current = Date.UTC(2026, 9, 10);
    const limits = { minute: 100, hour: 100, day: 100, month: 100, [period]: 1 };
    const guard = createAdmissionGuard({ store, limits, now: () => current });
    await guard.reserve(signal()); current += 61000;
    await assert.rejects(guard.reserve(signal()), e => e.code === `limit_${period}`);
    current -= 120000;
    await assert.rejects(createAdmissionGuard({ store, limits, now: () => current }).reserve(signal()));
    assert.equal(store.writes, 1);
  }
});

test('missing/corrupt store and ambiguous write fail closed with bounded repeated reads', async () => {
  let calls = 0;
  const guard = createAdmissionGuard({ store: { read: async () => { calls++; throw Error('no permission'); } } });
  await assert.rejects(guard.reserve(signal()), e => e.code === 'guard_unavailable');
  await assert.rejects(guard.reserve(signal()), e => e.code === 'guard_unavailable'); assert.equal(calls, 1);
  for (const state of [{}, { ...emptyAdmissionState(), lastMs: 1 }, { ...emptyAdmissionState(), paused: 'false' }]) {
    await assert.rejects(createAdmissionGuard({ store: { read: async () => ({ state }) } }).reserve(signal()), e => e.code === 'guard_unavailable');
  }
  const store = memoryStore();
  await assert.rejects(createAdmissionGuard({ store: { read: store.read, compareAndSwap: async (...args) => {
    await store.compareAndSwap(...args); throw Error('response lost');
  } } }).reserve(signal()), e => e.code === 'guard_unavailable');
  assert.equal(store.writes, 1); // Never compute following an uncertain commit.
});

test('operator pause and repeated CAS conflicts do not start work', async () => {
  const store = memoryStore(); store.state.paused = true;
  await assert.rejects(createAdmissionGuard({ store }).reserve(signal()), e => e.code === 'compute_paused' && e.status === 503);
  let writes = 0;
  await assert.rejects(createAdmissionGuard({ store: { read: async () => ({ state: emptyAdmissionState(), generation: '1' }),
    compareAndSwap: async () => { writes++; return false; } } }).reserve(signal()), e => e.code === 'guard_contended');
  assert.equal(writes, 3);
});

test('cancellation before or during admission consumes no permission to run', async () => {
  const controller = new AbortController(), store = memoryStore(); controller.abort();
  await assert.rejects(createAdmissionGuard({ store }).reserve(controller.signal), e => e.code === 'cancelled');
  assert.equal(store.reads, 0);
  const during = new AbortController();
  await assert.rejects(createAdmissionGuard({ store: { read: async () => { during.abort(); return store.read(); },
    compareAndSwap: store.compareAndSwap } }).reserve(during.signal), e => e.code === 'cancelled');
  assert.equal(store.writes, 0);
});

test('ingress flood gate is bounded and replenishes without trusting user headers', () => {
  let current = 1000; const gate = createIngressGate({ burst: 2, perSecond: 1, now: () => current });
  gate(); gate(); assert.throws(gate, e => e.code === 'request_rate');
  current += 1000; gate(); assert.throws(gate); current += 100000; gate(); gate(); assert.throws(gate);
});

test('Storage reads pin generation and conditional writes handle races without tokens in payloads', async () => {
  const calls = [], state = emptyAdmissionState(); let collide = false;
  const store = createGcsAdmissionStore({ bucket: 'test-bucket', token: async () => 'test-token', fetcher: async (url, init) => {
    calls.push({ url, init });
    if (url.includes('fields=generation')) return Response.json({ generation: '123' });
    if (url.includes('alt=media')) return Response.json(state);
    return new Response('', { status: collide ? 412 : 200 });
  } });
  assert.deepEqual(await store.read(signal()), { generation: '123', state });
  assert.ok(calls[1].url.endsWith('ifGenerationMatch=123'));
  assert.equal(await store.compareAndSwap('123', state, signal()), true);
  assert.ok(calls[2].url.endsWith('ifGenerationMatch=123'));
  assert.equal(calls[2].init.body, JSON.stringify(state));
  assert.equal(calls[2].init.headers.authorization, 'Bearer test-token');
  collide = true; assert.equal(await store.compareAndSwap('123', state, signal()), false);
  const missing = createGcsAdmissionStore({ bucket: 'test-bucket', token: async () => '', fetcher: async () => new Response('', { status: 404 }) });
  await assert.rejects(missing.read(signal()));
});

test('metadata token is cached then refreshed and rejected without Google response header', async () => {
  let current = 1000, calls = 0;
  const provider = createMetadataTokenProvider(async (_url, init) => {
    calls++; assert.equal(init.headers['Metadata-Flavor'], 'Google');
    return Response.json({ access_token: `test-${calls}`, expires_in: 3600 }, { headers: { 'Metadata-Flavor': 'Google' } });
  }, () => current);
  assert.equal(await provider(signal()), 'test-1'); assert.equal(await provider(signal()), 'test-1');
  current += 3600000; assert.equal(await provider(signal()), 'test-2');
  await assert.rejects(createMetadataTokenProvider(async () => Response.json({ access_token: 'untrusted', expires_in: 3600 }))(signal()));
});

test('HTTP guard rejects before worker, leaves health available, and logs contain no inputs', async t => {
  let runs = 0; const events = [], store = memoryStore(), limits = { minute: 1, hour: 10, day: 10, month: 10 };
  const pool = { run: async () => { runs++; return {result:{candidates:[]}}; }, close: async () => {} };
  const server = createComputeServer(pool, { usage: usageFixture(), admission: createAdmissionGuard({ store, limits }), report: e => events.push(e) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({ contract: COMPUTE_CONTRACT, origin: { lat: 37.4979, lng: 127.0276 },
    options: { version: '0.2', mode: 'free-loop', shape: 'heart', targetKm: 3, radiusKm: 2 }, refresh: false });
  const post = headers => fetch(`${base}/v1/routes`, { method: 'POST', headers: { 'content-type': 'application/json', ...usageHeaders(), ...headers }, body });
  assert.equal((await post()).status, 200);
  const denied = await post({ 'x-forwarded-for': '1.2.3.4', 'x-client-id': 'rotate-me' });
  assert.equal(denied.status, 429); assert.ok(Number(denied.headers.get('retry-after')) > 0);
  assert.equal((await denied.json()).error, 'limit_minute'); assert.equal(runs, 1);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.deepEqual(events.map(e => e.event), ['compute_admitted', 'compute_rejected']);
  assert.ok(!/37\.4979|1\.2\.3\.4|rotate-me/.test(JSON.stringify(events)));
});
