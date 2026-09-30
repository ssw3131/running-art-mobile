import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { runnable } from '../../src/modules/route-engine/engine.ts';
import { roadBounds } from '../../src/modules/road-data/client.ts';
import { coveringCells, wayIntersectsBounds, validateManifest } from '../../src/modules/road-data/file-format.ts';
import { readJson, writeJson, sha256, root } from './common.mjs';

const extracted = readJson('.cache/road-data/extracted.json');
const source = readJson('scripts/road-data/source-lock.json');
assert.deepEqual(extracted.source, source, 'Pinned extraction source');
const config = readJson('scripts/road-data/samples.json');
const elements = extracted.elements.filter(way => runnable(way.tags)).map(way => ({
  ...way, tags: Object.fromEntries(Object.entries(way.tags).sort(([a], [b]) => a.localeCompare(b))),
}));
const release = `kr-20260929-${source.sha256.slice(0, 12)}-roads-v1`;
const comparisons = [];
for (const step of config.gridStepsE7) {
  const directory = path.join(root, `grid-${step}`);
  const cells = new Map();
  for (const sample of config.samples) {
    for (const cell of coveringCells(roadBounds(sample.origin, config.radiusMeters), step)) cells.set(cell.id, cell);
  }
  const manifest = { format: 'running-art-road-manifest', schemaVersion: 1, release, coverage: 'samples',
    coordinateOrder: 'lat,lon', gridStepE7: step, source, files: [] };
  let brotliBytes = 0, gzipMs = 0, brotliMs = 0;
  for (const cell of cells.values()) {
    const ways = elements.filter(way => wayIntersectsBounds(way, cell.bounds));
    const tile = { format: 'running-art-road-tile', schemaVersion: 1, release, id: cell.id,
      bounds: cell.bounds, coordinateOrder: 'lat,lon', elements: ways };
    const decoded = Buffer.from(JSON.stringify(tile));
    let started = performance.now();
    const packed = gzipSync(decoded, { level: 6 }); gzipMs += performance.now() - started;
    started = performance.now();
    const brotli = brotliCompressSync(decoded, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
    brotliMs += performance.now() - started; brotliBytes += brotli.byteLength;
    const file = { id: cell.id, bounds: cell.bounds, path: `tiles/${cell.id}.json.gz`, encoding: 'gzip',
      bytes: packed.byteLength, sha256: sha256(packed), decodedBytes: decoded.byteLength,
      decodedSha256: sha256(decoded), ways: ways.length };
    fs.mkdirSync(path.join(directory, 'tiles'), { recursive: true });
    fs.writeFileSync(path.join(directory, file.path), packed);
    manifest.files.push(file);
  }
  validateManifest(manifest);
  writeJson(path.join(directory, 'manifest.json'), manifest);
  comparisons.push({ gridStepE7: step, files: manifest.files.length,
    jsonBytes: manifest.files.reduce((n, f) => n + f.decodedBytes, 0),
    gzipBytes: manifest.files.reduce((n, f) => n + f.bytes, 0), brotliBytes,
    largestGzipBytes: Math.max(...manifest.files.map(f => f.bytes)),
    largestDecodedBytes: Math.max(...manifest.files.map(f => f.decodedBytes)), gzipMs, brotliMs });
}
// Independent unsplit reference for each EXACT query rectangle. Not an old Seoul fixture.
for (const sample of config.samples) {
  const bounds = roadBounds(sample.origin, config.radiusMeters);
  writeJson(path.join(root, 'references', `${sample.id}.json`), { ...sample, bounds,
    elements: elements.filter(way => wayIntersectsBounds(way, bounds)) });
}
writeJson(path.join(root, 'packaging-report.json'), { source, runnableWays: elements.length, comparisons });
console.log(JSON.stringify({ runnableWays: elements.length, comparisons }, null, 2));
