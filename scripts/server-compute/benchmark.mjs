import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startServer } from './server.mjs';
import { readJson, writeJson, sha256 } from '../road-data/common.mjs';

const { values } = parseArgs({ options: {
  directory: { type: 'string', default: '.cache/server-compute/fixtures' },
  output: { type: 'string', default: 'docs/quality/server-compute-20261005.json' },
  runs: { type: 'string', default: '3' },
} });
const repeats = Number(values.runs);
assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 10);
const fixture = readJson(path.join(values.directory, 'index.json'));
const report = { recordedAt: new Date().toISOString(), environment: {
  kind: 'local Windows loopback HTTP and isolated Node child processes; NOT hosted cloud',
  node: process.version, platform: process.platform, release: os.release(), arch: process.arch,
  cpu: os.cpus()[0].model.trim(), logicalCpus: os.cpus().length, availableParallelism: os.availableParallelism(),
  totalRamBytes: os.totalmem(), freeRamBytesAtStart: os.freemem(),
  cpuQuota: 'none; one process is not a cloud vCPU quota',
}, sources: Object.fromEntries(['engine.ts', 'runner.ts'].map(name => [name, sha256(fs.readFileSync(`src/modules/route-engine/${name}`))])),
  fixture, records: [], checks: {} };
const save = () => writeJson(values.output, report);
async function request(server, entry, label) {
  const started = performance.now();
  const response = await fetch(`${server.url}/calculate/${entry.id}`, { signal: AbortSignal.timeout(180000) });
  assert.equal(response.status, 200);
  const body = await response.text();
  const responseMs = performance.now() - started;
  assert.equal(sha256(body), entry.expectedResultSha256, 'HTTP full result mismatch');
  const metrics = JSON.parse(response.headers.get('x-benchmark-metrics'));
  const record = { ...label, caseId: entry.id, responseMs, ...metrics };
  report.records.push(record);
  return record;
}
try {
  for (const entry of fixture.cases) {
    const server = await startServer({ directory: values.directory });
    try {
      const cold = await request(server, entry, { phase: 'cold-process', workers: 1, concurrency: 1, run: 1 });
      cold.startupMs = server.startupMs; cold.startupPlusResponseMs = server.startupMs + cold.responseMs;
      for (let run = 1; run <= repeats; run++) await request(server, entry, { phase: 'warm', workers: 1, concurrency: 1, run });
      save();
      console.log(JSON.stringify({ caseId: entry.id, phase: 'single', coldMs: cold.startupPlusResponseMs,
        warmMs: report.records.filter(r => r.caseId === entry.id && r.phase === 'warm').map(r => r.responseMs) }));
    } finally { await server.close(); }
  }
  const entry = fixture.cases.find(c => c.id === 'gangnam');
  for (const workers of [1, 2]) {
    const server = await startServer({ directory: values.directory, workers });
    try {
      // Warm every worker; no candidate-result cache exists.
      await Promise.all(Array.from({ length: workers }, () => request(server, entry, { phase: 'warmup', workers, concurrency: workers })));
      for (const concurrency of [1, 2, 4]) {
        for (let run = 1; run <= repeats; run++) {
          const started = performance.now();
          const rows = await Promise.all(Array.from({ length: concurrency }, () => request(server, entry,
            { phase: 'burst', workers, concurrency, run })));
          const batchMs = performance.now() - started;
          rows.forEach(row => { row.batchMs = batchMs; });
          save();
          console.log(JSON.stringify({ workers, concurrency, run, batchMs, responseMs: rows.map(r => r.responseMs) }));
        }
      }
    } finally { await server.close(); }
  }
  report.checks = { allFullHttpResultsMatch: true, allNodeRunnersMatch: fixture.cases.every(c => c.verification.fullNodeRunnerMatch),
    allPhoneRoutingMatch: fixture.cases.every(c => c.verification.phoneRoutingMatch),
    noHostedMeasurement: true, noResultCache: true };
  report.completedAt = new Date().toISOString(); save();
} catch (error) { report.failure = error.message; save(); throw error; }
