// Run only against the reviewed IAM-private Cloud Run deployment (or loopback smoke test).
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readJson, writeJson, sha256 } from '../road-data/common.mjs';

const { values } = parseArgs({ options: {
  url: { type: 'string' }, directory: { type: 'string', default: '.cache/server-compute/fixtures' },
  output: { type: 'string', default: '.cache/server-compute/hosted-report.json' },
  runs: { type: 'string', default: '3' },
} });
assert.ok(values.url, '--url required');
const url = new URL(values.url);
const loopback = url.protocol === 'http:' && url.hostname === '127.0.0.1';
assert.ok(loopback || (url.protocol === 'https:' && url.hostname.endsWith('.run.app')));
assert.ok(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/');
const token = process.env.BENCHMARK_ID_TOKEN;
assert.ok(loopback || token, 'IAM identity token required in BENCHMARK_ID_TOKEN; never print/save it');
const runs = Number(values.runs);
assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 3);
const fixture = readJson(path.join(values.directory, 'index.json'));
const report = { recordedAt: new Date().toISOString(), url: url.origin, kind: loopback ? 'local bundle smoke test' : 'hosted HTTP measurement',
  note: 'First observed request does not prove a cold instance. Verify deployment configuration/image/logs separately.', records: [] };
async function request(entry, phase, concurrency, run) {
  const started = performance.now();
  const record = { caseId: entry.id, phase, concurrency, run };
  try {
    const response = await fetch(new URL(`/calculate/${entry.id}`, url), {
      headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(180000), redirect: 'error',
    });
    record.status = response.status;
    const body = await response.text();
    record.responseMs = performance.now() - started;
    if (response.status === 200) {
      Object.assign(record, JSON.parse(response.headers.get('x-benchmark-metrics')));
      record.resultMatches = sha256(body) === entry.expectedResultSha256;
    } // Do not persist failure bodies or authorization headers.
  } catch (error) { record.error = error.name; record.responseMs = performance.now() - started; }
  report.records.push(record); writeJson(values.output, report);
  assert.ok(![401, 403].includes(record.status), 'IAM authentication failed; stop without retries');
}
for (const entry of fixture.cases) {
  await request(entry, 'first-observed', 1, 0);
  for (let run = 1; run <= runs; run++) await request(entry, 'repeat', 1, run);
}
for (const concurrency of [1, 2, 4]) for (let run = 1; run <= runs; run++) {
  await Promise.all(Array.from({ length: concurrency }, () => request(fixture.cases.find(c => c.id === 'gangnam'), 'burst', concurrency, run)));
}
report.completedAt = new Date().toISOString();
report.allResultsMatch = report.records.every(r => r.status === 200 && r.resultMatches);
report.failedRequests = report.records.filter(r => r.status !== 200 || !r.resultMatches).length;
writeJson(values.output, report);
console.log(JSON.stringify({ completed: true, requests: report.records.length, output: values.output }));
if (!report.allResultsMatch) process.exitCode = 1;
