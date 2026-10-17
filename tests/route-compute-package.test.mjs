import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildGraph, search } from '../src/modules/route-engine/engine.ts';

test('deployment bundle boots outside the checkout and computes expanded inputs without local dependencies', { timeout: 60000 }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'runpen-bundle-'));
  try {
    const bundle = path.join(temporary, 'bundle');
    const packaged = spawnSync(process.execPath, ['scripts/route-compute/package.mjs', bundle], { encoding: 'utf8' });
    assert.equal(packaged.status, 0, packaged.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'bundle.json')));
    for (const entry of manifest.files) {
      const bytes = fs.readFileSync(path.join(bundle, entry.path));
      assert.equal(bytes.length, entry.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    }
    const actual = fs.readdirSync(bundle, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile()).map(entry => path.relative(bundle, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort();
    assert.deepEqual(actual, [...manifest.files.map(entry => entry.path), 'package.json', 'Dockerfile', '.dockerignore', 'bundle.json'].sort());

    const grid = JSON.parse(fs.readFileSync('assets/route-lab/grid.json'));
    const options = [
      { shape: 'heart', targetKm: 3 }, { shape: 'dog', targetKm: 1 }, { shape: 'crown', targetKm: 10 },
      { shape: 'custom', targetKm: 5, customTemplate: [{x:0,y:1},{x:1,y:0},{x:0,y:-1},{x:-1,y:0},{x:0,y:1}] },
    ].map(value => ({ version: '0.2', mode: 'free-loop', radiusKm: 2, ...value }));
    const graph = buildGraph(grid.elements, grid.origin, 2000);
    const expected = options.map(option => createHash('sha256').update(JSON.stringify(search(graph, option))).digest('hex'));
    // The subprocess runs in an unrelated temp directory, with only the actual
    // deployment files. No repository imports or node_modules can mask omissions.
    const probe = spawnSync(process.execPath, ['--input-type=module', '--eval', `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { once } from 'node:events';
      import { Worker } from 'node:worker_threads';
      import { createHash } from 'node:crypto';
      import { createComputeServer } from './bundle/server/route-compute/server.mjs';
      import { buildGraph, search } from './bundle/src/modules/route-engine/engine.ts';
      import { SERVICE_SHAPES, GENERATION_DISTANCES } from './bundle/src/modules/route-engine/service-shapes.ts';
      import { COMPUTE_CONTRACT, parseComputeRequest, parseComputeResponse } from './bundle/src/modules/route-compute/contract.ts';
      const { grid, options } = JSON.parse(fs.readFileSync(0, 'utf8'));
      const makeRequest = option => ({ contract: COMPUTE_CONTRACT, origin: grid.origin, options: option, refresh: false });
      for (const shape of SERVICE_SHAPES) for (const targetKm of GENERATION_DISTANCES) {
        assert.equal(parseComputeRequest(makeRequest({ ...options[0], shape: shape.id, targetKm })).options.targetKm, targetKm);
      }
      const graph = buildGraph(grid.elements, grid.origin, 2000);
      const server = createComputeServer({
        run: async request => ({ contract: COMPUTE_CONTRACT, request, result: search(graph, request.options),
          metrics: { elapsedMs: 0, computeMs: 0, maxSliceMs: 0, yields: 0, nodes: graph.nodes.length, edges: graph.edges.length, routing: {} },
          roads: { release: 'synthetic-package-test', manifestHash: 'a'.repeat(64), cached: false },
          timing: { roadMs: 0, calculationMs: 0, totalMs: 0 } }), close: async () => {} });
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      const hashes = [];
      try {
        const base = 'http://127.0.0.1:' + server.address().port;
        assert.equal((await fetch(base + '/healthz')).status, 200);
        for (const option of options) {
          const request = makeRequest(option);
          const response = await fetch(base + '/v1/routes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
          assert.equal(response.status, 200);
          const value = parseComputeResponse(await response.json(), request);
          hashes.push(createHash('sha256').update(JSON.stringify(value.result)).digest('hex'));
        }
        assert.equal((await fetch(base + '/v1/routes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
      } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      // Boot the production worker as well; invalid input fails before any network request.
      const worker = new Worker(new URL('./bundle/server/route-compute/worker.mjs', import.meta.url), { execArgv: [] });
      try {
        const message = once(worker, 'message', { signal: AbortSignal.timeout(5000) });
        worker.postMessage({}); assert.deepEqual((await message)[0], { ok: false });
      } finally { await worker.terminate(); }
      console.log(JSON.stringify({ hashes, acceptedConditions: SERVICE_SHAPES.length * GENERATION_DISTANCES.length }));
    `], { cwd: temporary, input: JSON.stringify({ grid, options }), encoding: 'utf8', timeout: 45000 });
    assert.equal(probe.status, 0, probe.stderr || probe.error?.message);
    const result = JSON.parse(probe.stdout);
    assert.deepEqual(result.hashes, expected);
    assert.equal(result.acceptedConditions, 120);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
