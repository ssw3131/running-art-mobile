// Isolated Node process measurements. Never label these as Android/Hermes or CDN results.
import assert from 'node:assert/strict';
import { buildGraph } from '../../src/modules/route-engine/engine.ts';
import { roadBounds } from '../../src/modules/road-data/client.ts';
import { validateManifest, selectRoadFiles, decodeRoadTile, mergeRoadTiles } from '../../src/modules/road-data/file-format.ts';
import { readJson, codecs } from './common.mjs';

const [base, sampleId, grid] = process.argv.slice(2);
assert.equal(new URL(base).hostname, '127.0.0.1');
const config = readJson('scripts/road-data/samples.json');
const sample = config.samples.find(s => s.id === sampleId);
assert.ok(sample);
const step = Number(grid);
assert.ok(config.gridStepsE7.includes(step));
const bounds = roadBounds(sample.origin, config.radiusMeters);
const manifestResponse = await fetch(`${base}/grid-${step}/manifest.json`);
assert.ok(manifestResponse.ok);
const manifest = await manifestResponse.json(); validateManifest(manifest);
const files = selectRoadFiles(manifest, bounds);
const memory = () => ({ rss: process.memoryUsage().rss, heapUsed: process.memoryUsage().heapUsed,
  external: process.memoryUsage().external, maxRssBytes: process.resourceUsage().maxRSS * 1024 });
const records = [];
for (let run = 1; run <= 3; run++) {
  global.gc?.();
  const before = memory(), tiles = [], phases = { hashMs: 0, gunzipMs: 0, utf8Ms: 0 };
  const timed = Object.fromEntries(Object.entries(codecs).map(([key, fn]) => [key, (...args) => {
    const start = performance.now(), value = fn(...args);
    phases[key === 'sha256' ? 'hashMs' : `${key}Ms`] += performance.now() - start;
    return value;
  }]));
  let downloadMs = 0, decodeMs = 0;
  const started = performance.now();
  // Sequential download is explicit: reproducible laboratory baseline, not a production policy.
  for (const file of files) {
    let at = performance.now();
    const response = await fetch(`${base}/grid-${step}/${file.path}`, { signal: AbortSignal.timeout(10000) });
    assert.ok(response.ok);
    const bytes = new Uint8Array(await response.arrayBuffer());
    downloadMs += performance.now() - at;
    at = performance.now();
    tiles.push(decodeRoadTile(bytes, manifest, file, timed));
    decodeMs += performance.now() - at;
  }
  const afterDecode = memory();
  let at = performance.now();
  const elements = mergeRoadTiles(manifest, tiles, bounds), mergeMs = performance.now() - at;
  const afterMerge = memory();
  at = performance.now();
  const graph = buildGraph(elements, sample.origin, config.radiusMeters), graphMs = performance.now() - at;
  records.push({ run, downloadMs, decodeMs, ...phases, parseAndValidateMs: decodeMs - phases.hashMs - phases.gunzipMs - phases.utf8Ms,
    mergeMs, graphMs, totalMs: performance.now() - started, queryWays: elements.length, graphNodes: graph.nodes.length,
    before, afterDecode, afterMerge, afterGraph: memory() });
}
console.log(JSON.stringify({ sample: sampleId, gridStepE7: step, files: files.length,
  bytes: files.reduce((n, f) => n + f.bytes, 0), runtime: process.version, records }));
