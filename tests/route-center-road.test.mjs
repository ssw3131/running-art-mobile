import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoadLoader, roadBounds } from '../src/modules/road-data/client.ts';
import { createLabSession } from '../src/features/route-lab/session.ts';
import { createCenterController } from '../src/features/route-lab/center-controller.ts';
import { centerFromMap } from '../src/modules/map/coordinates.ts';

const origin = { lat: 37.57162, lng: 126.9764 };
const way = { type: 'way', id: 41, nodes: [123, 456], geometry: [{ lat: 37.571, lon: 126.976 }, { lat: 37.572, lon: 126.976 }], tags: { highway: 'footway' } };
const response = (data = { elements: [way], sourceLabel: 'OSM sample' }, area = '37.54,126.94,37.60,127.00') => new Response(JSON.stringify(data), { headers: { 'X-Road-Area': area } });
const signal = () => new AbortController().signal;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const input = () => ({ origin: { ...origin }, options: { version: '0.2', shape: 'heart', targetKm: 5, radiusKm: 2 }, elements: [way] });

test('road query uses the selected latitude/longitude and keeps OSM IDs and full way geometry', async () => {
  let requested;
  const load = createRoadLoader({ fetcher: async (url) => { requested = new URL(url); return response(); } });
  const result = await load(origin, 2000, signal());
  assert.equal(requested.searchParams.get('lat'), '37.57162');
  assert.equal(requested.searchParams.get('lng'), '126.9764');
  assert.equal(requested.searchParams.get('radius'), '2000');
  assert.deepEqual(result.elements, [way]);
  assert.equal(result.cached, false);
});

test('cache reuse requires the whole requested circle, expires, and cannot fall back to a different region', async () => {
  let requests = 0, now = 1000;
  const load = createRoadLoader({ now: () => now, fetcher: async () => { requests++; return response(); } });
  await load(origin, 2000, signal());
  assert.equal((await load({ ...origin, lng: origin.lng + .0001 }, 2000, signal())).cached, true);
  assert.equal(requests, 1);
  await assert.rejects(load({ ...origin, lng: 127.10 }, 2000, signal()), /모두 포함/);
  assert.equal(requests, 2);
  now += 15 * 60000;
  assert.equal((await load(origin, 2000, signal())).cached, false);
  assert.equal(requests, 3);
});

test('a different area downloads independently and an aborted late response never enters the cache', async () => {
  let requests = 0;
  const pending = deferred();
  const load = createRoadLoader({ fetcher: async (_url, options) => {
    requests++;
    if (requests === 1) { await pending.promise; assert.equal(options.signal.aborted, true); }
    return response();
  } });
  const controller = new AbortController();
  const first = load(origin, 2000, controller.signal);
  controller.abort(); pending.resolve();
  await assert.rejects(first, /취소/);
  assert.equal((await load(origin, 2000, signal())).cached, false);
  assert.equal(requests, 2);
  const elsewhere = createRoadLoader({ fetcher: async () => response({ elements: [way] }, '37.54,127.08,37.60,127.16') });
  assert.equal((await elsewhere({ ...origin, lng: 127.12 }, 2000, signal())).cached, false);
});

test('partial, malformed, out-of-coverage and rate-limited data fail explicitly', async () => {
  for (const makeResponse of [
    () => response({ elements: [way], remark: 'runtime error: timeout' }),
    () => response({ elements: [null] }),
    () => response({ elements: [{ ...way, nodes: [123] }] }),
    () => response({ error: 'no data' }),
    () => response({ elements: [way] }, '37.57,126.97,37.58,126.98'),
    () => new Response('too many requests', { status: 429 }),
  ]) {
    await assert.rejects(createRoadLoader({ fetcher: async () => makeResponse() })(origin, 2000, signal()));
  }
  assert.throws(() => roadBounds({ lat: NaN, lng: 127 }, 2000));
  assert.throws(() => roadBounds({ lat: 0, lng: 180 }, 2000));
});

test('road timeout aborts network work and returns a retryable error', async () => {
  const load = createRoadLoader({ timeoutMs: 5, fetcher: (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('abort')), { once: true });
  }) });
  await assert.rejects(load(origin, 2000, signal()), /시간이 초과/);
});

test('session snapshots the selected center, passes matching roads, and separates lookup/calculation/total wall times', async () => {
  let now = 0, actual;
  const request = { input: input(), liveRoads: true };
  const downloaded = [{ ...way, id: 99 }];
  const session = createLabSession(async (center, radius) => {
    assert.deepEqual(center, origin); assert.equal(radius, 2000);
    request.input.origin.lng = 128; request.input.options.targetKm = 7;
    now = 125; return { elements: downloaded, source: 'OSM', cached: true };
  }, async (value) => {
    assert.deepEqual(value.origin, origin); assert.equal(value.options.targetKm, 5); assert.deepEqual(value.elements, downloaded);
    now = 425; return { result: { candidates: [] }, metrics: { elapsedMs: 300 } };
  }, () => now);
  await session.start(request, { progress() {}, success(value) { actual = value; }, error(error) { throw error; } });
  assert.deepEqual(actual.origin, origin);
  assert.deepEqual(actual.timing, { roadMs: 125, calculationMs: 300, totalMs: 425 });
  assert.equal(actual.cached, true);
});

test('map move/restart cancels an unfinished download and suppresses stale calculation/publication', async () => {
  const delayed = deferred(); let loads = 0, runs = 0;
  const published = [];
  const session = createLabSession(async () => { loads++; if (loads === 1) await delayed.promise; return { elements: [way], source: 'OSM', cached: false }; }, async (value) => { runs++; return { result: {}, metrics: {}, value }; });
  const callbacks = { progress() {}, success: (value) => published.push(value), error: (error) => { throw error; } };
  const first = session.start({ input: input(), liveRoads: true }, callbacks);
  session.cancel();
  const newer = input(); newer.origin.lng = 127.1;
  await session.start({ input: newer, liveRoads: true }, callbacks);
  delayed.resolve(); await first;
  assert.equal(runs, 1); assert.equal(published.length, 1);
  assert.equal(published[0].origin.lng, 127.1);
});

test('cancel guards late progress/results/errors; fixed fixtures bypass network', async () => {
  const delayed = deferred(); let published = 0;
  const session = createLabSession(() => { throw new Error('fixed fixture must not fetch'); }, async (_value, settings) => {
    await delayed.promise; settings.onProgress({ phase: 'routing', text: 'late' }); throw new Error('late error');
  });
  const job = session.start({ input: input(), liveRoads: false }, { progress: () => published++, success: () => published++, error: () => published++ });
  session.cancel(); delayed.resolve(); await job;
  assert.equal(published, 0);
});

test('map coordinates are longitude-first and reject unsupported centers', () => {
  assert.deepEqual(centerFromMap([126.9764, 37.57162]), origin);
  assert.equal(centerFromMap([37.57, 126.97]), null);
  assert.equal(centerFromMap([NaN, 37.57]), null);
});

test('late GPS cannot undo a manual pan; explicit locate can select a fresh current position again', async () => {
  let positionCallback, removals = 0;
  const provider = {
    getPermission: async () => ({ granted: true }), requestPermission: async () => ({ granted: true }), servicesEnabled: async () => true,
    watch: async (callback) => { positionCallback = callback; return { remove: () => removals++ }; },
  };
  const states = [];
  const controller = createCenterController(provider, origin, (state) => states.push(state));
  const first = controller.locate(); await tick();
  const stale = positionCallback;
  controller.beginMove(); controller.move({ lat: 37.55, lng: 127.1 });
  stale({ latitude: 37.6, longitude: 127.2, accuracy: 5, timestamp: Date.now() });
  await first;
  assert.deepEqual(controller.get().center, { lat: 37.55, lng: 127.1 });
  assert.equal(controller.get().cameraTarget, undefined);
  const second = controller.locate(); await tick();
  positionCallback({ latitude: 37.6, longitude: 127.2, accuracy: 5, timestamp: Date.now() });
  await second;
  assert.deepEqual(controller.get().center, { lat: 37.6, lng: 127.2 });
  assert.deepEqual(controller.get().cameraTarget.center, { lat: 37.6, lng: 127.2 });
  assert.equal(removals, 2);
});

test('denied GPS leaves the manually usable map center and does not request roads', async () => {
  const controller = createCenterController({ getPermission: async () => ({ granted: false, canAskAgain: false }) }, origin, () => {});
  await controller.locate();
  assert.equal(controller.get().location.kind, 'denied');
  assert.deepEqual(controller.get().center, origin);
  assert.equal(controller.get().cameraTarget, undefined);
});
