// Read-only live R2 check, then a fresh process with all network calls forbidden.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { createRoadCache, migrateRoadCache } from '../../src/modules/road-data/persistent-cache.ts';
import { createRoadLoader } from '../../src/modules/road-data/client.ts';
import { DEFAULT_ROAD_BASE_URL, roadSamples } from '../../src/modules/road-data/channel.ts';
import { mobileRoadCodecs } from '../../src/modules/road-data/mobile-codecs.ts';
import { buildGraph } from '../../src/modules/route-engine/engine.ts';
import { readJson, writeJson, sha256 } from './common.mjs';

const offline = process.argv[2] === '--offline-child';
fs.mkdirSync('build/road-cache', { recursive: true });
const filename = offline ? process.argv[3] : path.join(fs.mkdtempSync('build/road-cache/r2-'), 'cache.db');
const db = openSqlite(filename); await migrateRoadCache(db);
const cache = createRoadCache(db, mobileRoadCodecs);
const requests = [], events = [];
const load = createRoadLoader({ getCache: async () => cache, onAttempt: event => events.push(event), fetcher: (url, init) => {
  assert.equal(offline, false, 'Offline process must never access the network');
  assert.equal(new URL(url).origin, DEFAULT_ROAD_BASE_URL, 'All other origins, including the old API, are blocked');
  requests.push(url); return fetch(url, init);
} });
const samples = [];
try {
  for (const sample of roadSamples) {
    const reference = readJson(`build/road-data/references/${sample.id}.json`);
    const result = await load(sample.origin, 2000, new AbortController().signal, offline ? 'offline' : 'prefer-cache');
    assert.deepEqual(result.elements, reference.elements);
    const graph = buildGraph(result.elements, sample.origin, 2000);
    assert.deepEqual(graph, buildGraph(reference.elements, sample.origin, 2000));
    samples.push({ id: sample.id, ...result.cache, ways: result.elements.length, nodes: graph.nodes.length, edges: graph.edges.length,
      inputSha256: sha256(JSON.stringify(result.elements)), inputEqual: true, graphEqual: true });
  }
  const report = { recordedAt: new Date().toISOString(), runtime: process.version, environment: 'windows-node-sqlite-live-r2-mobile-codecs',
    otherOriginsBlocked: true, offline, requests: requests.length, samples, usage: await cache.status(), events };
  await cache.close();
  if (offline) console.log(JSON.stringify(report));
  else {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--offline-child', filename], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    report.offlineProcess = JSON.parse(child.stdout);
    assert.equal(report.offlineProcess.requests, 0);
    writeJson('build/road-cache/r2-channel-report.json', report);
    console.log(JSON.stringify({ requests: report.requests, files: report.usage.files, bytes: report.usage.bytes,
      samples: report.samples.map(s => ({ id: s.id, inputEqual: s.inputEqual, graphEqual: s.graphEqual })), offlineRequests: report.offlineProcess.requests }));
  }
} catch (error) { await db.closeAsync().catch(() => {}); throw error; }
