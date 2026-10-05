import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startServer } from '../scripts/server-compute/server.mjs';
import { sha256, writeJson } from '../scripts/road-data/common.mjs';

// Independent upstream grid reference; these tests do not need R2 or prepared private cache.
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runpen-server-compute-'));
  const bytes = fs.readFileSync('assets/route-lab/grid.json');
  const input = JSON.parse(bytes); input.options.mode = 'anchored';
  const reference = JSON.parse(fs.readFileSync('assets/route-lab/baselines.json')).find(
    b => b.fixture === 'grid' && b.options.shape === 'heart' && b.options.targetKm === 5 && b.options.version === '0.2');
  const expectedResultSha256 = sha256(JSON.stringify(reference.result));
  fs.writeFileSync(path.join(directory, 'grid.json'), bytes);
  writeJson(path.join(directory, 'index.json'), { cases: [{ id: 'grid', synthetic: true,
    options: input.options, fixtureSha256: sha256(bytes), inputSha256: sha256(JSON.stringify(input)), expectedResultSha256 }] });
  return { directory, expectedResultSha256 };
}

function removeFixture(directory) {
  fs.unlinkSync(path.join(directory, 'grid.json'));
  fs.unlinkSync(path.join(directory, 'index.json'));
  fs.rmdirSync(directory);
}

test('bounded queue, responsive HTTP, complete result and input-only reuse', async () => {
  const { directory, expectedResultSha256 } = fixture();
  const server = await startServer({ directory, maxQueue: 1 });
  try {
    assert.equal((await fetch(`${server.url}/calculate/unknown`)).status, 404);
    assert.equal((await fetch(`${server.url}/calculate/grid`, { method: 'POST' })).status, 405);
    const requests = [fetch(`${server.url}/calculate/grid`), fetch(`${server.url}/calculate/grid`)];
    let health;
    for (let i = 0; i < 100; i++) {
      health = await (await fetch(`${server.url}/health`)).json();
      if (health.active === 1 && health.queued === 1) break;
      await sleep(5);
    }
    assert.deepEqual(health, { active: 1, queued: 1 });
    assert.equal((await fetch(`${server.url}/calculate/grid`)).status, 503);
    const responses = await Promise.all(requests);
    const metrics = [];
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(sha256(await response.text()), expectedResultSha256);
      metrics.push(JSON.parse(response.headers.get('x-benchmark-metrics')));
    }
    assert.deepEqual(metrics.map(m => m.inputCached), [false, true]);
    assert.ok(metrics[1].queueMs > metrics[0].queueMs);
    assert.ok(metrics.every(m => m.routing.pathSearches > 0));
  } finally { await server.close(); removeFixture(directory); }
});

test('corrupt locked input fails without publishing a successful candidate', async () => {
  const { directory } = fixture();
  fs.appendFileSync(path.join(directory, 'grid.json'), ' ');
  const server = await startServer({ directory });
  try { assert.equal((await fetch(`${server.url}/calculate/grid`)).status, 500); }
  finally { await server.close(); removeFixture(directory); }
});

test('calculation timeout fails active requests and queued work', async () => {
  const { directory } = fixture();
  const server = await startServer({ directory, timeoutMs: 50 });
  try {
    const responses = await Promise.all([fetch(`${server.url}/calculate/grid`), fetch(`${server.url}/calculate/grid`)]);
    assert.deepEqual(responses.map(r => r.status), [500, 503]);
    assert.equal((await fetch(`${server.url}/health`)).status, 503);
  } finally { await server.close(); removeFixture(directory); }
});
