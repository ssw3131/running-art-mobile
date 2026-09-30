import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as engine from '../../src/modules/route-engine/engine.ts';
import { selectRoadFiles, decodeRoadTile, mergeRoadTiles } from '../../src/modules/road-data/file-format.ts';
import { readJson, writeJson, codecs, sha256, root, options } from './common.mjs';

function connectivity(graph) {
  const adjacency = graph.nodes.map(() => []);
  for (const edge of graph.edges) { adjacency[edge.a].push(edge.b); adjacency[edge.b].push(edge.a); }
  const seen = new Set(), sizes = [];
  for (let id = 0; id < adjacency.length; id++) {
    if (seen.has(id)) continue;
    const queue = [id]; seen.add(id);
    for (let i = 0; i < queue.length; i++) for (const to of adjacency[queue[i]]) {
      if (!seen.has(to)) { seen.add(to); queue.push(to); }
    }
    sizes.push(queue.length);
  }
  return { weakComponents: sizes.length, largestWeakComponent: Math.max(0, ...sizes),
    directedLinks: graph.nodes.reduce((n, node) => n + node.links.length, 0) };
}
const config = readJson('scripts/road-data/samples.json');
const records = [];
for (const sample of config.samples) {
  const reference = readJson(path.join(root, 'references', `${sample.id}.json`));
  let started = performance.now();
  const graph = engine.buildGraph(reference.elements, sample.origin, config.radiusMeters);
  const graphMs = performance.now() - started;
  started = performance.now();
  const result = engine.search(graph, options);
  // search adds a runtime reachability set; compare the two fresh buildGraph outputs.
  delete graph.reachable;
  const referenceSearchMs = performance.now() - started;
  const resultSha256 = sha256(JSON.stringify(result));
  assert.ok(graph.nodes.length > 100, `${sample.id}: real populated graph`);
  assert.ok(result.candidates.length > 0, `${sample.id}: routes exist`);
  writeJson(path.join(root, 'references', `${sample.id}-result.json`), result);
  for (const step of config.gridStepsE7) {
    const directory = path.join(root, `grid-${step}`), manifest = readJson(path.join(directory, 'manifest.json'));
    const files = selectRoadFiles(manifest, reference.bounds);
    started = performance.now();
    const tiles = files.map(file => decodeRoadTile(fs.readFileSync(path.join(directory, file.path)), manifest, file, codecs));
    const decodeMs = performance.now() - started;
    started = performance.now();
    const elements = mergeRoadTiles(manifest, tiles, reference.bounds);
    const mergeMs = performance.now() - started;
    assert.deepEqual(elements, reference.elements, `${sample.id}/${step}: full unsplit input`);
    started = performance.now();
    const rebuilt = engine.buildGraph(elements, sample.origin, config.radiusMeters);
    const buildGraphMs = performance.now() - started;
    assert.deepEqual(rebuilt, graph, `${sample.id}/${step}: complete graph including link directions`);
    started = performance.now();
    const actual = engine.search(rebuilt, options);
    const searchMs = performance.now() - started;
    assert.deepEqual(actual, result, `${sample.id}/${step}: ALL candidates, raw scores, ordering and statistics`);
    const occurrences = new Map();
    for (const tile of tiles) for (const way of tile.elements) occurrences.set(way.id, (occurrences.get(way.id) ?? 0) + 1);
    const record = { sample: sample.id, gridStepE7: step, files: files.length,
      packedBytes: files.reduce((n, f) => n + f.bytes, 0), decodedBytes: files.reduce((n, f) => n + f.decodedBytes, 0),
      duplicatedWays: [...occurrences.values()].filter(n => n > 1).length,
      wayOccurrences: tiles.reduce((n, t) => n + t.elements.length, 0), uniqueDownloadedWays: occurrences.size,
      queryWays: elements.length, nodes: graph.nodes.length, edges: graph.edges.length, ...connectivity(graph),
      decodeMs, mergeMs, buildGraphMs, searchMs, candidates: actual.candidates.length, resultSha256,
      unsplitGraphMs: graphMs, unsplitSearchMs: referenceSearchMs, inputEqual: true, graphEqual: true, resultEqual: true };
    records.push(record);
    console.log(JSON.stringify(record));
  }
}
writeJson(path.join(root, 'verification-report.json'), { recordedAt: new Date().toISOString(),
  runtime: process.version, platform: `${process.platform}-${process.arch}`, source: readJson('scripts/road-data/source-lock.json'), options, records });
writeJson(path.join(root, 'benchmark-cases.json'), config.samples.map(sample => {
  const record = records.find(r => r.sample === sample.id);
  const reference = readJson(path.join(root, 'references', `${sample.id}.json`));
  return { id: sample.id, origin: sample.origin, radiusMeters: config.radiusMeters,
    queryWays: record.queryWays, nodes: record.nodes, edges: record.edges, inputSha256: sha256(JSON.stringify(reference.elements)) };
}));
