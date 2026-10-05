// Benchmark adapter only. Product engine and search rules are unchanged.
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildGraph, search } from '../../src/modules/route-engine/engine.ts';
import { validateInput } from '../../src/modules/route-engine/runner.ts';
import { decodeRoadTile, mergeRoadTiles } from '../../src/modules/road-data/file-format.ts';
import { codecs, sha256 } from '../road-data/common.mjs';

export function readInput(directory, entry) {
  let input;
  if (entry.synthetic) {
    const bytes = fs.readFileSync(path.join(directory, 'grid.json'));
    assert.equal(sha256(bytes), entry.fixtureSha256);
    input = JSON.parse(bytes);
    input.options = entry.options;
  } else {
    const bytes = fs.readFileSync(path.join(directory, `${entry.manifestHash}.json`));
    assert.equal(sha256(bytes), entry.manifestHash);
    const manifest = JSON.parse(bytes);
    const tiles = entry.files.map(file => decodeRoadTile(
      fs.readFileSync(path.join(directory, `${file.sha256}.json.gz`)), manifest, file, codecs));
    input = { origin: entry.origin, options: entry.options, elements: mergeRoadTiles(manifest, tiles, entry.bounds) };
  }
  assert.equal(sha256(JSON.stringify(input)), entry.inputSha256, 'Input lock mismatch');
  return input;
}

export function runCalculation(input) {
  const started = performance.now(), cpu = process.cpuUsage();
  validateInput(input);
  const validated = performance.now();
  const graph = buildGraph(input.elements, input.origin, input.options.radiusKm * 1000);
  const graphDone = performance.now();
  const routing = {};
  const result = search(graph, input.options, undefined, routing);
  const ended = performance.now(), used = process.cpuUsage(cpu);
  const serializeStart = performance.now();
  const serialized = JSON.stringify(result);
  const serializeMs = performance.now() - serializeStart;
  return { serialized, resultSha256: sha256(serialized), metrics: {
    calculationMs: ended - started, validationMs: validated - started,
    graphMs: graphDone - validated, searchMs: ended - graphDone, serializeMs,
    cpuMs: (used.user + used.system) / 1000, nodes: graph.nodes.length, edges: graph.edges.length,
    routing, candidates: result.candidates.length, scores: result.candidates.map(c => c.score.raw),
    responseBytes: Buffer.byteLength(serialized), rssBytes: process.memoryUsage().rss,
    processLifetimeMaxRssKiB: process.resourceUsage().maxRSS,
  } };
}
