// Development-only fixture preparation. The app never imports the sibling project.
// Usage: node scripts/prepare-route-reference.mjs <original running-art directory>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const original = process.argv[2];
if (!original) throw new Error('Pass the original running-art directory.');
const source = path.resolve(original);
const reference = path.join(root, 'tests/reference/v02');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const normalizedHash = (file) => hash(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
for (const line of fs.readFileSync(path.join(reference, 'SHA256SUMS.txt'), 'utf8').trim().split(/\r?\n/)) {
  const [expected, name] = line.trim().split(/\s+/);
  assert.equal(normalizedHash(path.join(reference, name)), expected, `Reference source hash: ${name}`);
}
for (const name of ['route-engine.js', 'route-worker.js']) {
  assert.equal(normalizedHash(path.join(reference, 'src', name)), normalizedHash(path.join(source, 'versions/v0.2', name)));
}
const require = createRequire(import.meta.url);
const engine = require(path.join(reference, 'src/route-engine.js'));
const tilePath = path.join(source, 'data/seoul-road-tiles.json');
const tileData = JSON.parse(fs.readFileSync(tilePath, 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(source, 'data/seoul-roads-meta.json'), 'utf8'));
const origin = meta.center;
const radiusKm = 2;
const ways = new Map();
for (const compressed of Object.values(tileData.tiles)) {
  for (const way of JSON.parse(gunzipSync(Buffer.from(compressed, 'base64')))) {
    if (ways.has(way.id)) continue;
    if (way.geometry?.some((p) => p && Math.hypot(...Object.values(engine.toPoint(p.lat, p.lon, origin))) <= radiusKm * 1000)) {
      ways.set(way.id, way);
    }
  }
}
const sample = { origin, options: { version: '0.2', shape: 'heart', targetKm: 3, radiusKm }, elements: [...ways.values()].sort((a, b) => a.id - b.id) };
const save = (file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data) + '\n');
save('assets/route-lab/seoul.json', sample);
save('assets/route-lab/provenance.json', {
  source: meta.source, license: meta.license, sourceUrl: meta.sourceUrl, collectedAt: meta.date,
  sourceFile: 'data/seoul-road-tiles.json', sourceSha256: hash(fs.readFileSync(tilePath)),
  extraction: 'Ways with at least one vertex within 2 km of the original Gwanghwamun center; full original way geometry, tags and node IDs preserved; deduplicated and sorted by way ID. Graph builder applies the exact v0.2 radius filter.',
  origin, radiusKm, ways: sample.elements.length,
  fixtures: Object.fromEntries(['grid', 'seoul'].map((id) => [id, hash(fs.readFileSync(path.join(root, `assets/route-lab/${id}.json`)))])),
});
const cases = [
  { id: 'grid-heart-v02', fixture: 'grid' },
  { id: 'grid-heart-v01', fixture: 'grid', options: { version: '0.1' } },
  { id: 'grid-diamond-v02', fixture: 'grid', options: { shape: 'diamond', targetKm: 3 } },
  { id: 'seoul-heart-v02', fixture: 'seoul' },
  { id: 'seoul-heart-5km-v02', fixture: 'seoul', options: { targetKm: 5 } },
  { id: 'seoul-diamond-v02', fixture: 'seoul', options: { shape: 'diamond' } },
];
fs.mkdirSync(path.join(root, 'tests/fixtures/route-engine'), { recursive: true });
const baselines = [];
for (const item of cases) {
  const input = JSON.parse(fs.readFileSync(path.join(root, `assets/route-lab/${item.fixture}.json`)));
  const options = { ...input.options, ...item.options };
  const started = performance.now();
  const graph = engine.buildGraph(input.elements, input.origin, options.radiusKm * 1000);
  const result = engine.search(graph, options);
  save(`tests/fixtures/route-engine/${item.id}.json`, { id: item.id, fixture: item.fixture, options, result });
  baselines.push({ id: item.id, fixture: item.fixture, options, result });
  console.log(JSON.stringify({ id: item.id, nodes: graph.nodes.length, roads: graph.edges.length, elapsedMs: Math.round(performance.now() - started), candidates: result.candidates.length, best: result.candidates[0]?.score.raw }));
}
save('assets/route-lab/baselines.json', baselines);
