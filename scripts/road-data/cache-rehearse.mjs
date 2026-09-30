// Real local samples + SQLite, then a fresh offline process. No cloud credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { createRoadCache, migrateRoadCache } from '../../src/modules/road-data/persistent-cache.ts';
import { mobileRoadCodecs } from '../../src/modules/road-data/mobile-codecs.ts';
import { createCacheLabDownloads, ROAD_CACHE_LAB_SOURCE } from '../../src/features/road-cache-lab/source.ts';
import { buildGraph } from '../../src/modules/route-engine/engine.ts';
import { readJson, writeJson, sha256 } from './common.mjs';
import { createSampleServer } from './serve.mjs';

const config = readJson('scripts/road-data/samples.json');
async function inspect(cache, mode, downloads = {}) {
  const results = [];
  for (const sample of config.samples) {
    const reference = readJson(`build/road-data/references/${sample.id}.json`);
    const result = await cache.load({ source: ROAD_CACHE_LAB_SOURCE, bounds: reference.bounds, mode,
      signal: new AbortController().signal, ...downloads });
    assert.deepEqual(result.elements, reference.elements);
    const graph = buildGraph(result.elements, sample.origin, config.radiusMeters);
    assert.deepEqual(graph, buildGraph(reference.elements, sample.origin, config.radiusMeters));
    results.push({ id: sample.id, files: result.files, reused: result.reused, downloaded: result.downloaded,
      ways: result.elements.length, nodes: graph.nodes.length, edges: graph.edges.length,
      inputSha256: sha256(JSON.stringify(result.elements)), manifestSha256: result.manifestHash,
      inputEqual: true, graphEqual: true });
  }
  return results;
}
async function openCache(filename) {
  const db = openSqlite(filename);
  try { await migrateRoadCache(db); return createRoadCache(db, mobileRoadCodecs); }
  catch (error) { await db.closeAsync(); throw error; }
}

if (process.argv[2] === '--offline-child') {
  const cache = await openCache(process.argv[3]);
  let networkCalls = 0;
  const forbidden = async () => { networkCalls++; throw new Error('Offline transport must not be called'); };
  try {
    const samples = await inspect(cache, 'offline', { downloadManifest: forbidden, downloadTile: forbidden });
    assert.equal(networkCalls, 0);
    console.log(JSON.stringify({ samples, networkCalls, usage: await cache.status() }));
  } finally { await cache.close(); }
} else {
  const output = path.resolve('build/road-cache'); fs.mkdirSync(output, { recursive: true });
  const directory = fs.mkdtempSync(path.join(output, 'rehearsal-'));
  const filename = path.join(directory, 'cache.db'), cache = await openCache(filename);
  const server = createSampleServer();
  let requests = 0, manifestRequests = 0;
  let online, before;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const downloads = createCacheLabDownloads((url, options) => {
      const request = new URL(url);
      assert.equal(request.origin, 'http://127.0.0.1:8766');
      requests++; if (request.pathname.endsWith('/manifest.json')) manifestRequests++;
      request.port = String(server.address().port);
      return fetch(request, options);
    });
    online = await inspect(cache, 'prefer-cache', downloads);
    before = await cache.status();
    assert.equal(manifestRequests, 1);
    assert.equal(requests, 1 + online.reduce((n, sample) => n + sample.downloaded, 0));
  } finally {
    await cache.close();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
  // The HTTP server and all DB handles are closed before the separate process.
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--offline-child', filename], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const offline = JSON.parse(child.stdout);
  assert.deepEqual(offline.usage, before);
  assert.ok(offline.samples.every(sample => sample.downloaded === 0 && sample.reused === sample.files));
  const report = { recordedAt: new Date().toISOString(), runtime: process.version,
    environment: 'windows-node-sqlite-loopback-http-mobile-codecs', cloudTested: false, phoneTested: false,
    expoNativeBridgeTested: false, separateOfflineProcess: true, localHttpRequests: requests, manifestRequests,
    cachedPayloadBytes: before.bytes, cacheLimitBytes: before.maxBytes, cachedFiles: before.files,
    online, offline };
  writeJson('build/road-cache/rehearsal-report.json', report);
  console.log(JSON.stringify(report, null, 2));
}
