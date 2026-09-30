import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { openSqlite } from './helpers/sqlite.mjs';
import { codecs, sha256 } from '../scripts/road-data/common.mjs';
import { createRoadCache, migrateRoadCache } from '../src/modules/road-data/persistent-cache.ts';
import { createCacheLabDownloads } from '../src/features/road-cache-lab/source.ts';

const box = column => [37.002, column * .02 + .002, 37.01, column * .02 + .018];
function dataset(release = 'test-a') {
  const manifest = { format: 'running-art-road-manifest', schemaVersion: 1, release, coverage: 'samples',
    coordinateOrder: 'lat,lon', gridStepE7: 200000, source: { sha256: 'a'.repeat(64), url: 'https://example.com/source.pbf',
      dataTimestamp: '2026-09-29T20:22:51Z', license: 'ODbL-1.0', attribution: 'OSM' }, files: [] };
  const payloads = new Map();
  for (const col of [6350, 6351, 6352]) {
    const id = `1850_${col}`, bounds = [37, col * 200000 / 1e7, 37.02, (col + 1) * 200000 / 1e7];
    const tile = { format: 'running-art-road-tile', schemaVersion: 1, release, id, bounds, coordinateOrder: 'lat,lon',
      elements: [{ type: 'way', id: col, nodes: [col * 2, col * 2 + 1], tags: { highway: 'residential' },
        geometry: [{ lat: 37.003, lon: bounds[1] + .003 }, { lat: 37.009, lon: bounds[1] + .009 }] }] };
    const raw = Buffer.from(JSON.stringify(tile)), packed = gzipSync(raw);
    const file = { id, bounds, path: `tiles/${id}.json.gz`, encoding: 'gzip', bytes: packed.length, sha256: sha256(packed),
      decodedBytes: raw.length, decodedSha256: sha256(raw), ways: 1 };
    manifest.files.push(file); payloads.set(id, packed);
  }
  const bytes = Buffer.from(JSON.stringify(manifest));
  let downloads = 0, manifests = 0;
  return { manifest, bytes, payloads, count: () => downloads, manifests: () => manifests,
    downloadManifest: async () => { manifests++; return bytes; },
    downloadTile: async (_manifest, file) => { downloads++; return payloads.get(file.id); } };
}
async function fixture(t, options = {}, hooks) {
  const db = openSqlite(':memory:', hooks); await migrateRoadCache(db);
  const cache = createRoadCache(db, codecs, options); t.after(() => db.closeAsync());
  return { db, cache };
}
function request(data, extra = {}) {
  return { source: 'test-source', bounds: box(6350), mode: 'refresh', signal: new AbortController().signal,
    downloadManifest: data.downloadManifest, downloadTile: data.downloadTile, ...extra };
}
const code = wanted => error => error.code === wanted;

test('persistent gzip cache reuses complete input with zero download calls', async t => {
  const { cache } = await fixture(t), data = dataset();
  const first = await cache.load(request(data));
  const reused = await cache.load(request(data, { mode: 'prefer-cache' }));
  const offline = await cache.load(request(data, { mode: 'offline', downloadManifest: undefined, downloadTile: undefined }));
  assert.deepEqual(offline.elements, first.elements);
  assert.equal(first.downloaded, 1); assert.equal(reused.reused, 1); assert.equal(offline.downloaded, 0);
  assert.equal(data.count(), 1); assert.equal(data.manifests(), 1);
});

test('offline never calls transport; partial coverage and separate source are rejected', async t => {
  const { cache } = await fixture(t), data = dataset();
  await cache.load(request(data));
  const forbidden = async () => { throw new Error('network called'); };
  await assert.rejects(cache.load(request(data, { mode: 'offline', bounds: box(6351), downloadTile: forbidden })), code('missing'));
  await assert.rejects(cache.load(request(data, { mode: 'offline', source: 'other', downloadManifest: forbidden })), code('missing'));
  assert.equal((await cache.status()).files, 1);
});

test('tile and manifest corruption are rejected offline and repaired by validated input', async t => {
  const { cache, db } = await fixture(t), data = dataset();
  await cache.load(request(data));
  await db.runAsync('UPDATE road_cache_tiles SET payload=?', new Uint8Array([1, 2, 3]));
  await assert.rejects(cache.load(request(data, { mode: 'offline' })), code('corrupt'));
  assert.equal((await cache.load(request(data, { mode: 'prefer-cache' }))).downloaded, 1);
  await db.runAsync('UPDATE road_cache_datasets SET manifest=?', new Uint8Array([1]));
  await assert.rejects(cache.load(request(data, { mode: 'offline' })), code('corrupt'));
  await cache.load(request(data));
  assert.equal((await cache.load(request(data, { mode: 'offline' }))).release, 'test-a');
});

test('failed or mixed-version update retains old active version and writes no partial tiles', async t => {
  const { cache } = await fixture(t), old = dataset(), next = dataset('test-b');
  const original = await cache.load(request(old));
  const twoCells = [37.002, 127.002, 37.01, 127.038];
  let attempts = 0;
  await assert.rejects(cache.load(request(next, { bounds: twoCells, downloadTile: async (manifest, file) => {
    if (++attempts === 2) throw new Error('network failure');
    return next.downloadTile(manifest, file);
  } })), /network failure/);
  assert.equal((await cache.status()).files, 1);
  await assert.rejects(cache.load(request(next, { downloadTile: old.downloadTile })), /ROAD_FILE_/);
  assert.equal((await cache.load(request(old, { mode: 'offline' }))).manifestHash, original.manifestHash);
});

test('aborted queued/download work cannot store or publish a new version', async t => {
  const { cache } = await fixture(t), old = dataset(), next = dataset('test-b');
  await cache.load(request(old));
  const controller = new AbortController();
  await assert.rejects(cache.load(request(next, { signal: controller.signal, downloadTile: async (manifest, file) => {
    const payload = await next.downloadTile(manifest, file); controller.abort(); return payload;
  } })), code('cancelled'));
  await assert.rejects(cache.load(request(next, { signal: controller.signal })), code('cancelled'));
  assert.equal((await cache.status()).datasets, 1);
  assert.equal((await cache.load(request(old, { mode: 'offline' }))).release, 'test-a');
});

test('cancellation during SQLite transaction rolls back completed inserts', async t => {
  let abortDuringWrite = false;
  const controller = new AbortController();
  const { cache } = await fixture(t, {}, { afterRun: sql => { if (abortDuringWrite && sql.startsWith('INSERT INTO road_cache_tiles')) controller.abort(); } });
  const old = dataset(), next = dataset('test-b');
  await cache.load(request(old)); abortDuringWrite = true;
  await assert.rejects(cache.load(request(next, { signal: controller.signal })), code('cancelled'));
  assert.equal((await cache.status()).datasets, 1);
  assert.equal((await cache.load(request(old, { mode: 'offline' }))).release, 'test-a');
});

test('SQLite write failure preserves previous pointer, payload and metadata', async t => {
  const { cache, db } = await fixture(t), old = dataset(), next = dataset('test-b');
  await cache.load(request(old));
  const before = await cache.status();
  await db.execAsync("CREATE TRIGGER fail_cache BEFORE INSERT ON road_cache_tiles BEGIN SELECT RAISE(ABORT,'simulated disk full'); END;");
  await assert.rejects(cache.load(request(next)), code('storage'));
  assert.deepEqual(await cache.status(), before);
  assert.equal((await cache.load(request(old, { mode: 'offline' }))).release, 'test-a');
});

test('expiry is not extended by hits; valid old data is a labelled fallback if refresh fails', async t => {
  let time = 1000;
  const { cache } = await fixture(t, { now: () => time, maxAgeMs: 100 }); const data = dataset();
  await cache.load(request(data)); time = 1090;
  await cache.load(request(data, { mode: 'prefer-cache' })); time = 1100;
  const result = await cache.load(request(data, { mode: 'prefer-cache', downloadManifest: async () => { throw new Error('offline'); } }));
  assert.equal(result.stale, true); assert.equal(result.updateFailed, true); assert.equal(result.checkedAt, 1000);
  await assert.rejects(cache.load(request(data, { downloadManifest: async () => { throw new Error('offline'); } })), /offline/);
  assert.equal((await cache.load(request(data, { mode: 'offline' }))).stale, true);
});

test('LRU eviction frees other cells of the same version and protects requested files', async t => {
  const data = dataset();
  const maxBytes = data.bytes.length + Math.max(...data.manifest.files.map(file => file.bytes));
  let time = 1;
  const { cache } = await fixture(t, { maxBytes, now: () => time++ });
  await cache.load(request(data));
  await cache.load(request(data, { mode: 'prefer-cache', bounds: box(6351) }));
  assert.ok((await cache.status()).bytes <= maxBytes);
  assert.equal((await cache.load(request(data, { mode: 'offline', bounds: box(6351) }))).files, 1);
  await assert.rejects(cache.load(request(data, { mode: 'offline' })), code('missing'));
  await assert.rejects(cache.load(request(data, { bounds: [37.002, 127.002, 37.01, 127.038] })), code('capacity'));
  assert.equal((await cache.load(request(data, { mode: 'offline', bounds: box(6351) }))).files, 1);
});

test('clear and concurrent loads wait until in-use payloads have produced input', async t => {
  const { cache } = await fixture(t), data = dataset();
  let release, began;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { began = resolve; });
  const loading = cache.load(request(data, { downloadTile: async (manifest, file) => { began(); await gate; return data.downloadTile(manifest, file); } }));
  await started;
  const queued = cache.load(request(data, { mode: 'offline' }));
  let cleared = false; const clearing = cache.clear().then(() => { cleared = true; });
  await Promise.resolve(); assert.equal(cleared, false);
  release();
  const [loaded, saved] = await Promise.all([loading, queued]);
  assert.deepEqual(loaded.elements, saved.elements);
  await clearing; assert.equal((await cache.status()).files, 0);
  assert.equal(loaded.elements.length, 1);
});

test('file cache survives process exit; unfinished SQLite transaction is rolled back on reopen', async t => {
  const parent = path.resolve('.cache/road-cache-tests'); fs.mkdirSync(parent, { recursive: true });
  const folder = fs.mkdtempSync(path.join(parent, 'restart-')), filename = path.join(folder, 'cache.db');
  t.after(() => { assert.ok(path.resolve(folder).startsWith(parent + path.sep)); fs.rmSync(folder, { recursive: true, force: true }); });
  let db = openSqlite(filename); await migrateRoadCache(db); let cache = createRoadCache(db, codecs); const data = dataset();
  const before = await cache.load(request(data)); await cache.close();
  const child = spawnSync(process.execPath, ['--input-type=module', '-e',
    'import {DatabaseSync} from "node:sqlite"; const db=new DatabaseSync(process.argv[1]); db.exec("BEGIN IMMEDIATE; UPDATE road_cache_tiles SET payload=X\'00\'; DELETE FROM road_cache_current;"); process.exit(23);', filename]);
  assert.equal(child.status, 23, child.stderr.toString());
  db = openSqlite(filename); await migrateRoadCache(db); cache = createRoadCache(db, codecs);
  try { assert.deepEqual((await cache.load(request(data, { mode: 'offline', downloadTile: undefined }))).elements, before.elements); }
  finally { await cache.close(); }
});

test('future schema is preserved and rejected', async t => {
  const db = openSqlite(); t.after(() => db.closeAsync());
  await db.execAsync("CREATE TABLE keep(value TEXT); INSERT INTO keep VALUES('unchanged'); PRAGMA user_version=2;");
  await assert.rejects(migrateRoadCache(db), code('newer-schema'));
  assert.equal((await db.getFirstAsync('SELECT value FROM keep')).value, 'unchanged');
});

test('lab transport bounds headers and cancels even an uncooperative body', async () => {
  const signal = new AbortController().signal;
  const bad = createCacheLabDownloads(async () => new Response('x', { headers: { 'Content-Length': '999999999' } }));
  await assert.rejects(bad.downloadManifest(signal), /크기/);
  const hanging = createCacheLabDownloads(async () => ({ ok: true, headers: new Headers({ 'Content-Length': '4' }), arrayBuffer: () => new Promise(() => {}) }), 10);
  await assert.rejects(hanging.downloadManifest(signal), /초과/);
  const controller = new AbortController();
  const ignored = createCacheLabDownloads(async () => new Promise(() => {}));
  const loading = ignored.downloadManifest(controller.signal); controller.abort();
  await assert.rejects(loading, /취소/);
});
