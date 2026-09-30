import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createSampleServer } from './serve.mjs';
import { readJson, writeJson, root } from './common.mjs';

const server = createSampleServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${server.address().port}`;
const results = [];
try {
  // Guard the server boundary and response semantics once before measurement.
  assert.equal((await fetch(`${base}/source-lock.json`)).status, 404);
  assert.equal((await fetch(`${base}/grid-200000/manifest.json`, { method: 'POST' })).status, 405);
  const config = readJson('scripts/road-data/samples.json');
  for (const step of config.gridStepsE7) for (const sample of config.samples) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--expose-gc', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        'scripts/road-data/measure.mjs', base, sample.id, String(step)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let out = '', err = '';
      child.stdout.on('data', b => { out += b; }); child.stderr.on('data', b => { err += b; });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err)));
    });
    results.push(result);
    console.log(JSON.stringify({ sample: sample.id, gridStepE7: step, totalMs: result.records.map(r => r.totalMs) }));
  }
  writeJson(`${root}/local-transfer-report.json`, { recordedAt: new Date().toISOString(),
    environment: 'Windows Node loopback HTTP; sequential transfer; 3 runs; separate process per sample/grid',
    limitations: 'Not CDN, wireless network, Android or Hermes. Stage snapshots and process high-water RSS are not per-operation peak memory.', results });
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
