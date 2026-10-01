import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import { openSqlite } from './helpers/sqlite.mjs';
import { codecs, sha256 } from '../scripts/road-data/common.mjs';
import { createRoadCache, migrateRoadCache } from '../src/modules/road-data/persistent-cache.ts';
import { createRoadLoader, roadBounds } from '../src/modules/road-data/client.ts';
import { coveringCells } from '../src/modules/road-data/file-format.ts';
import { DEFAULT_ROAD_BASE_URL, ROAD_PREFIX, roadBaseUrl } from '../src/modules/road-data/channel.ts';
import { createCenterController } from '../src/features/route-lab/center-controller.ts';

const origin = { lat: 37.4979, lng: 127.0276 };
const signal = () => new AbortController().signal;
const tick = () => new Promise(resolve => setImmediate(resolve));
function sample(release = 'test-a') {
  const manifest = { format: 'running-art-road-manifest', schemaVersion: 1, release, coverage: 'samples', coordinateOrder: 'lat,lon', gridStepE7: 200000,
    source: { sha256: 'a'.repeat(64), url: 'https://example.com/source.pbf', dataTimestamp: '2026-09-29T20:22:51Z', license: 'ODbL-1.0', attribution: 'OSM' }, files: [] };
  const tiles = new Map();
  let id = 1;
  for (const cell of coveringCells(roadBounds(origin, 2000), 200000)) {
    const way = { type: 'way', id: id++, nodes: [id * 2, id * 2 + 1], tags: { highway: 'footway' },
      geometry: [{ lat: cell.bounds[0] + .004, lon: cell.bounds[1] + .004 }, { lat: cell.bounds[2] - .004, lon: cell.bounds[3] - .004 }] };
    const raw = Buffer.from(JSON.stringify({ format: 'running-art-road-tile', schemaVersion: 1, release, ...cell, coordinateOrder: 'lat,lon', elements: [way] }));
    const packed = gzipSync(raw), path = `tiles/${cell.id}.json.gz`;
    manifest.files.push({ ...cell, path, encoding: 'gzip', bytes: packed.length, sha256: sha256(packed), decodedBytes: raw.length, decodedSha256: sha256(raw), ways: 1 });
    tiles.set(path, packed);
  }
  // Pretty bytes intentionally differ from JSON.stringify(parsed): cached tile URLs need the exact original hash.
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), hash = sha256(bytes);
  const prefix = `${ROAD_PREFIX}/releases/${release}-g200000-${hash}`;
  const pointer = { format: 'running-art-road-channel', schemaVersion: 1, coverage: 'samples', release, gridStepE7: 200000,
    manifest: { key: `${prefix}/manifest.json`, bytes: bytes.length, sha256: hash } };
  const objects = new Map([[`${ROAD_PREFIX}/current.json`, Buffer.from(JSON.stringify(pointer))], [`${prefix}/manifest.json`, bytes],
    ...[...tiles].map(([path, value]) => [`${prefix}/${path}`, value])]);
  return { pointer, manifest, bytes, hash, prefix, objects };
}
function response(url, bytes, overrides = {}) {
  const r = new Response(bytes, { headers: { 'content-length': String(bytes.length), 'content-type': url.endsWith('.gz') ? 'application/gzip' : 'application/json', ...overrides } });
  Object.defineProperty(r, 'url', { value: url });
  return r;
}
function server(data, calls, override) {
  return async (url, init) => {
    calls.push(url);
    assert.equal(new URL(url).origin, DEFAULT_ROAD_BASE_URL); // Every other origin, including the legacy API, is blocked.
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
    const key = new URL(url).pathname.slice(1), bytes = data.objects.get(key);
    assert.ok(bytes, `unexpected path ${key}`);
    return override?.(url, bytes, init) ?? response(url, bytes);
  };
}
async function fixture(t, data = sample(), options = {}) {
  const db = openSqlite(':memory:'); await migrateRoadCache(db);
  const cache = createRoadCache(db, codecs, options), calls = [], events = [];
  const load = createRoadLoader({ getCache: async () => cache, fetcher: server(data, calls), onAttempt: e => events.push(e) });
  t.after(() => db.closeAsync());
  return { db, cache, calls, events, load, data };
}

test('empty cache downloads pointer, exact manifest and complete tiles; subsequent and offline loads use no network', async t => {
  const { load, calls, events, data, cache } = await fixture(t);
  const first = await load(origin, 2000, signal());
  assert.equal(first.cache.downloaded, data.manifest.files.length); assert.equal(first.cached, false);
  const count = calls.length; assert.equal(count, 2 + data.manifest.files.length);
  for (const mode of ['prefer-cache', 'offline']) {
    const saved = await load(origin, 2000, signal(), mode);
    assert.deepEqual(saved.elements, first.elements); assert.equal(saved.cached, true); assert.equal(saved.cache.manifestHash, data.hash);
    assert.equal(calls.length, count); assert.equal(events.at(-1).requests, 0);
  }
  assert.equal((await cache.status()).files, data.manifest.files.length);
});

test('closed SQLite and a new loader reuse exact original manifest paths for a missing tile without checking a new pointer', async t => {
  fs.mkdirSync('build/road-cache', { recursive: true });
  const file = `build/road-cache/channel-${process.pid}.db`, data = sample(), calls = [];
  let db = openSqlite(file); await migrateRoadCache(db);
  let cache = createRoadCache(db, codecs);
  const makeLoader = () => createRoadLoader({ getCache: async () => cache, fetcher: server(data, calls) });
  const first = await makeLoader()(origin, 2000, signal());
  await db.runAsync('DELETE FROM road_cache_tiles WHERE cell=?', data.manifest.files[0].id);
  await cache.close(); db = openSqlite(file); await migrateRoadCache(db); cache = createRoadCache(db, codecs);
  t.after(async () => { await cache.close(); for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true }); });
  calls.length = 0;
  const next = await makeLoader()(origin, 2000, signal());
  assert.deepEqual(next.elements, first.elements); assert.equal(calls.length, 1);
  assert.ok(calls[0].includes(data.hash)); assert.equal(next.cache.downloaded, 1);
});

test('outside coverage fails clearly; an offline region without saved tiles never requests a provider', async t => {
  const { load, calls, cache } = await fixture(t);
  await assert.rejects(load(origin, 2000, signal(), 'offline'), /먼저 자료/); assert.equal(calls.length, 0);
  await assert.rejects(load({ lat: 35, lng: 129 }, 2000, signal()), /아직 도로 자료가 없는 지역/);
  assert.equal(calls.length, 2); assert.equal((await cache.status()).files, 0);
});

test('pointer paths, size, schema and manifest hashes cannot redirect or poison the cache', async t => {
  const { cache } = await fixture(t);
  for (const mutate of [
    p => { p.manifest.key = 'https://other.test/manifest.json'; },
    p => { p.manifest.key = `${ROAD_PREFIX}/../manifest.json`; },
    p => { p.schemaVersion = 2; }, p => { p.manifest.bytes = 2 ** 24; },
    p => { p.manifest.sha256 = 'b'.repeat(64); },
  ]) {
    const data = sample(), calls = []; mutate(data.pointer);
    data.objects.set(`${ROAD_PREFIX}/current.json`, Buffer.from(JSON.stringify(data.pointer)));
    const load = createRoadLoader({ getCache: async () => cache, fetcher: server(data, calls) });
    await assert.rejects(load(origin, 2000, signal())); assert.equal(calls.length, 1);
  }
  const data = sample(); data.objects.set(`${data.prefix}/manifest.json`, Buffer.from('x'.repeat(data.bytes.length)));
  await assert.rejects(createRoadLoader({ getCache: async () => cache, fetcher: server(data, []) })(origin, 2000, signal()));
  assert.equal((await cache.status()).datasets, 0);
});

test('HTTP errors, compressed transport, redirect, wrong MIME and streamed overflow/truncation fail without writes or retry', async t => {
  const { cache, data } = await fixture(t);
  const failures = [
    url => ({ ...response(url, new Uint8Array(0)), status: 429, body: null }),
    (url, bytes) => response(url, bytes, { 'content-encoding': 'gzip' }),
    (url, bytes) => response(url, bytes, { 'content-type': 'text/html' }),
    (url, bytes) => response(url, bytes, { 'content-length': String(bytes.length - 1) }),
    (url, bytes) => response(url, bytes, { 'content-length': String(bytes.length + 1) }),
    (url, bytes) => response('https://other.test/current.json', bytes),
  ];
  for (const override of failures) {
    const calls = [];
    await assert.rejects(createRoadLoader({ getCache: async () => cache, fetcher: server(data, calls, override) })(origin, 2000, signal()));
    assert.equal(calls.length, 1); assert.equal((await cache.status()).files, 0);
  }
});

test('tile corruption prevents partial commit; a subsequent explicit retry succeeds', async t => {
  const { cache, data } = await fixture(t), calls = [];
  const load = createRoadLoader({ getCache: async () => cache, fetcher: server(data, calls, (url, bytes) => {
    if (url.endsWith(data.manifest.files[1].path)) { const corrupt = Buffer.from(bytes); corrupt[20] ^= 1; return response(url, corrupt); }
  }) });
  await assert.rejects(load(origin, 2000, signal()), /검증에 실패/); assert.equal((await cache.status()).files, 0);
  const retry = createRoadLoader({ getCache: async () => cache, fetcher: server(data, []) });
  assert.equal((await retry(origin, 2000, signal())).cache.downloaded, data.manifest.files.length);
});

test('deadline covers stalled bodies and releases the cache queue for retry', async t => {
  const { cache, data } = await fixture(t);
  let transport;
  const load = createRoadLoader({ getCache: async () => cache, timeoutMs: 15, fetcher: async (url, init) => {
    transport = init.signal;
    return { status: 200, url, redirected: false, headers: new Headers({ 'content-length': '100', 'content-type': 'application/json' }), body: new ReadableStream({ start() {} }) };
  } });
  await assert.rejects(load(origin, 2000, signal()), /시간이 초과/); assert.equal(transport.aborted, true);
  assert.equal((await cache.status()).files, 0);
  assert.equal((await createRoadLoader({ getCache: async () => cache, fetcher: server(data, []) })(origin, 2000, signal())).cached, false);
});

test('cancellation after partial download keeps the previous dataset and suppresses late writes', async t => {
  const { cache, load } = await fixture(t);
  const previous = await load(origin, 2000, signal());
  const next = sample('test-b'), controller = new AbortController(); let late;
  const changed = createRoadLoader({ getCache: async () => cache, fetcher: server(next, [], (url, bytes) => {
    if (url.endsWith(next.manifest.files[1].path)) return new Promise(resolve => { late = () => resolve(response(url, bytes)); });
  }) });
  const job = changed(origin, 2000, controller.signal, 'refresh');
  while (!late) await tick();
  controller.abort(); await assert.rejects(job, /취소/); late(); await tick();
  const saved = await load(origin, 2000, signal(), 'offline');
  assert.deepEqual(saved.elements, previous.elements); assert.equal(saved.cache.manifestHash, previous.cache.manifestHash);
});

test('expired data is labeled after failed refresh; explicit refresh reports failure and preserves cache', async t => {
  let now = 1000;
  const { cache, load } = await fixture(t, sample(), { now: () => now, maxAgeMs: 100 });
  await load(origin, 2000, signal()); now += 100;
  const offline = createRoadLoader({ getCache: async () => cache, fetcher: async () => { throw new TypeError('offline'); } });
  const fallback = await offline(origin, 2000, signal());
  assert.equal(fallback.cache.stale, true); assert.equal(fallback.cache.updateFailed, true); assert.match(fallback.source, /갱신 실패/);
  await assert.rejects(offline(origin, 2000, signal(), 'refresh'));
  assert.equal((await offline(origin, 2000, signal(), 'offline')).cached, true);
});

test('public origin config excludes credentials and API paths; selected samples cancel delayed GPS', async () => {
  for (const url of ['http://roads.test', 'https://user:secret@roads.test', 'https://roads.test/api', 'https://roads.test/?key=secret']) assert.throws(() => roadBaseUrl(url));
  let deliver;
  const controller = createCenterController({ getPermission: async () => ({ granted: true }), servicesEnabled: async () => true,
    watch: async callback => { deliver = callback; return { remove() {} }; } }, origin, () => {});
  const gps = controller.locate(); await tick(); controller.choose(origin);
  deliver({ latitude: 35, longitude: 129, accuracy: 5, timestamp: Date.now() }); await gps;
  assert.deepEqual(controller.get().center, origin); assert.deepEqual(controller.get().cameraTarget.center, origin);
});
