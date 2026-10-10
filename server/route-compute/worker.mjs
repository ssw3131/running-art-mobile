import { parentPort } from 'node:worker_threads';
import { buildGraph, search } from '../../src/modules/route-engine/engine.ts';
import { validateInput } from '../../src/modules/route-engine/runner.ts';
import { COMPUTE_CONTRACT, parseComputeRequest } from '../../src/modules/route-compute/contract.ts';
import { createServerRoads } from './roads.mjs';

const load = await createServerRoads(process.env.ROAD_BASE_URL);
parentPort.on('message', async raw => {
  try {
    const request = parseComputeRequest(raw), started = performance.now();
    const roads = await load(request, AbortSignal.timeout(45000)), ready = performance.now();
    const input = { origin: request.origin, options: request.options, elements: roads.elements };
    validateInput(input);
    const graph = buildGraph(input.elements, input.origin, input.options.radiusKm * 1000), routing = {};
    const result = search(graph, input.options, undefined, routing), finished = performance.now();
    parentPort.postMessage({ ok: true, value: { contract: COMPUTE_CONTRACT, request, result,
      metrics: { elapsedMs: finished - ready, computeMs: finished - ready, maxSliceMs: finished - ready,
        yields: 0, nodes: graph.nodes.length, edges: graph.edges.length, routing },
      roads: { release: roads.release, manifestHash: roads.manifestHash, cached: roads.downloaded === 0 },
      timing: { roadMs: ready - started, calculationMs: finished - ready, totalMs: finished - started } } });
  } catch { parentPort.postMessage({ ok: false }); }
});
