import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readJson, sha256, writeJson } from '../road-data/common.mjs';

const report = readJson('docs/quality/server-compute-20261005.json');
const checks = {};
assert.equal(report.records.length, 57); checks.measurementCount = true;
assert.ok(report.completedAt && !report.failure); checks.completedMeasurement = true;
for (const [file, hash] of Object.entries(report.sources)) {
  assert.equal(sha256(fs.readFileSync(`src/modules/route-engine/${file}`)), hash);
}
checks.productEngineUnchanged = true;
for (const entry of report.fixture.cases) {
  const cold = report.records.filter(r => r.caseId === entry.id && r.phase === 'cold-process');
  const warm = report.records.filter(r => r.caseId === entry.id && r.phase === 'warm');
  assert.equal(cold.length, 1); assert.equal(cold[0].inputCached, false);
  assert.equal(warm.length, 3); assert.ok(warm.every(r => r.inputCached));
  for (const record of report.records.filter(r => r.caseId === entry.id)) {
    assert.equal(record.resultSha256, entry.expectedResultSha256);
    assert.deepEqual(record.routing, entry.phone.routing);
    assert.equal(record.nodes, entry.phone.nodes); assert.equal(record.edges, entry.phone.edges);
    assert.equal(record.candidates, entry.phone.candidates);
    assert.ok(record.scores.every((score, i) => Math.abs(score - entry.phone.scores[i]) < 1e-9));
    assert.ok(record.calculationMs > 0 && record.responseMs >= record.calculationMs);
  }
  assert.ok(entry.verification.fullNodeRunnerMatch && entry.verification.phoneRoutingMatch);
  assert.equal(entry.verification.fullPhoneGeometryCompared, entry.synthetic);
}
checks.recordsAndPhoneEvidence = true;
for (const workers of [1, 2]) for (const concurrency of [1, 2, 4]) {
  for (let run = 1; run <= 3; run++) {
    assert.equal(report.records.filter(r => r.phase === 'burst' && r.workers === workers && r.concurrency === concurrency && r.run === run).length, concurrency);
  }
}
checks.concurrentMatrix = true;
const bundle = 'build/server-compute/20261005-reviewed';
const manifest = readJson(`${bundle}/bundle.json`);
for (const file of manifest.files) {
  assert.equal(sha256(fs.readFileSync(`${bundle}/${file.path}`)), file.sha256);
  if (!file.path.startsWith('fixtures/')) assert.equal(sha256(fs.readFileSync(file.path)), file.sha256);
}
checks.bundleSourceHashes = true;
const smoke = readJson('.cache/server-compute/bundle-reviewed-smoke.json');
assert.equal(smoke.records.length, 13); assert.ok(smoke.completedAt && smoke.allResultsMatch);
assert.ok(smoke.records.every(r => r.status === 200 && r.resultMatches));
checks.reviewedBundleHttp = true;
writeJson('docs/quality/server-compute-verification-20261005.json', {
  checkedAt: new Date().toISOString(), checks, engineHashes: report.sources,
  measuredResponses: report.records.length, bundleResponses: smoke.records.length,
  measuredWorkerPids: [...new Set([...report.records, ...smoke.records].map(r => r.workerPid))],
  bundleFiles: manifest.files.length, bundleCopiedBytes: manifest.totalCopiedBytes,
  limits: ['This report verifies local measurements; hosted results are in cloud-run-compute-20261005.json',
    'Real-road phone full geometry not exported', 'Local PC has no CPU/memory quota'],
});
console.log(JSON.stringify(checks));
