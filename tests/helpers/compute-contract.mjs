import { readFileSync } from 'node:fs';
import { buildGraph, search } from '../../src/modules/route-engine/engine.ts';
export const request = { contract: 'runpen-routes-v1', origin: { lat: 37.4979, lng: 127.0276 }, options: { version: '0.2', mode: 'free-loop', shape: 'heart', targetKm: 3, radiusKm: 2 }, refresh: false };
let result;
export function response(input = request) {
  if (!result) {
    const grid = JSON.parse(readFileSync(new URL('../../assets/route-lab/grid.json', import.meta.url)));
    result = JSON.parse(JSON.stringify(search(buildGraph(grid.elements, grid.origin, 2000), request.options)));
  }
  return { contract: request.contract, request: input, result,
    metrics: { elapsedMs: 1, computeMs: 1, maxSliceMs: 1, yields: 0, nodes: 1, edges: 1, routing: {} },
    roads: { release: 'public-grid-fixture', manifestHash: 'a'.repeat(64), cached: false }, timing: { roadMs: 1, calculationMs: 1, totalMs: 2 } };
}
