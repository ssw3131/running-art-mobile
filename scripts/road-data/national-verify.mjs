import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { runnable, buildGraph } from '../../src/modules/route-engine/engine.ts';
import { roadBounds } from '../../src/modules/road-data/client.ts';
import { nationalRegionId, validateNationalCatalog } from '../../src/modules/road-data/national-format.ts';
import { selectRoadFiles, decodeRoadTile, mergeRoadTiles, wayIntersectsBounds } from '../../src/modules/road-data/file-format.ts';
import { readJson, writeJson, sha256, codecs } from './common.mjs';

const { values } = parseArgs({ options: {
  input: { type: 'string', default: 'build/road-data/national-verified' },
  source: { type: 'string', default: '.cache/road-data/national-verified.jsonl' },
} });
const locations = [
  ['seoul',37.4979,127.0276], ['busan',35.1796,129.0756], ['incheon',37.4563,126.7052],
  ['daegu',35.8714,128.6014], ['daejeon',36.3504,127.3845], ['gwangju',35.1595,126.8526],
  ['ulsan',35.5384,129.3114], ['sejong',36.4800,127.2890], ['suwon',37.2636,127.0286],
  ['chuncheon',37.8813,127.7300], ['cheongju',36.6424,127.4890], ['hongseong',36.6013,126.6608],
  ['jeonju',35.8242,127.1480], ['muan',34.9905,126.4817], ['andong',36.5684,128.7294],
  ['changwon',35.2281,128.6811], ['jeju',33.4996,126.5312], ['seogwipo',33.2541,126.5601],
  ['ulleung',37.4845,130.9057], ['guro-boundary',37.48,126.88], ['region-corner',37.5,127],
  ['pangyo',37.400805,127.101494],
];
const cases = locations.map(([id, lat, lng]) => ({ id, origin: { lat, lng }, radius: 2000 }));
cases.push({ id: 'region-corner-10km', origin: { lat: 37.5, lng: 127 }, radius: 10000 });
for (const item of cases) { item.bounds = roadBounds(item.origin, item.radius); item.elements = []; }
const extraction = readJson(values.source + '.report.json');
const hash = createHash('sha256'), sourceStream = fs.createReadStream(values.source);
sourceStream.on('data', chunk => hash.update(chunk));
let metadata, count = 0;
// Independent direct source scan: do not use the packager's spatial index.
for await (const line of readline.createInterface({ input: sourceStream, crlfDelay: Infinity })) {
  const way = JSON.parse(line);
  if (!metadata) { metadata = way; assert.deepEqual(way.source, extraction.source); continue; }
  count++;
  if (!runnable(way.tags)) continue;
  const lat = way.geometry.map(p => p.lat), lon = way.geometry.map(p => p.lon);
  const box = [Math.min(...lat), Math.min(...lon), Math.max(...lat), Math.max(...lon)];
  for (const item of cases) {
    const q = item.bounds;
    if (box[0] > q[2] || box[2] < q[0] || box[1] > q[3] || box[3] < q[1]) continue;
    if (wayIntersectsBounds(way, q)) item.elements.push(way);
  }
}
assert.equal(count, extraction.extractedWays);
assert.equal(hash.digest('hex'), extraction.outputSha256);
const catalog = readJson(path.join(values.input, 'catalog.json'));
validateNationalCatalog(catalog);
assert.equal(catalog.sourceSha256, metadata.source.sha256);
const records = [];
for (const item of cases) {
  const region = catalog.regions.find(r => r.id === nationalRegionId(item.origin));
  const bytes = fs.readFileSync(path.join(values.input, 'manifests', `${region.manifest.sha256}.json`));
  assert.equal(bytes.length, region.manifest.bytes); assert.equal(sha256(bytes), region.manifest.sha256);
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.release, catalog.release);
  const files = selectRoadFiles(manifest, item.bounds);
  const tiles = files.map(f => decodeRoadTile(fs.readFileSync(path.join(values.input, f.path)), manifest, f, codecs));
  const actual = mergeRoadTiles(manifest, tiles, item.bounds);
  item.elements.sort((a,b) => a.id - b.id);
  assert.deepEqual(actual, item.elements, `${item.id}: complete source input`);
  const expectedGraph = buildGraph(item.elements, item.origin, item.radius);
  assert.deepEqual(buildGraph(actual, item.origin, item.radius), expectedGraph, `${item.id}: complete graph`);
  assert.ok(expectedGraph.nodes.length > 0, `${item.id}: populated representative`);
  const record = { id: item.id, origin: item.origin, radiusMeters: item.radius, region: region.id,
    files: files.length, inputWays: actual.length, nodes: expectedGraph.nodes.length, edges: expectedGraph.edges.length,
    packedBytes: files.reduce((n,f) => n + f.bytes, 0), decodedBytes: files.reduce((n,f) => n + f.decodedBytes, 0),
    inputSha256: sha256(JSON.stringify(actual)), inputEqual: true, graphEqual: true };
  records.push(record); console.log(JSON.stringify(record));
}
writeJson(path.join(values.input, 'verification-report.json'), { recordedAt: new Date().toISOString(),
  source: metadata.source, extractionSha256: extraction.outputSha256, runtime: process.version, records });
