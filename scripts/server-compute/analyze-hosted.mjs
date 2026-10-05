// Summarize the approved, fixed 66-request Cloud Run experiment without hiding failures.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { readJson, writeJson } from '../road-data/common.mjs';

const read = name => JSON.parse(fs.readFileSync(`.cache/server-compute/${name}.json`, 'utf8').replace(/^\uFEFF/, ''));
const median = values => {
  assert.ok(values.length > 0);
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const fixture = readJson('.cache/server-compute/fixtures/index.json');
const experiments = [1, 2].map(cpu => {
  const report = read(`cloud-${cpu}cpu`);
  const deployment = read(`cloud-${cpu}cpu-deployment`);
  const template = deployment.spec.template;
  const container = template.spec.containers[0];
  assert.equal(report.records.length, 33);
  assert.ok(report.completedAt);
  assert.equal(template.spec.containerConcurrency, cpu);
  assert.equal(container.resources.limits.cpu, String(cpu));
  assert.equal(container.resources.limits.memory, `${cpu}Gi`);
  assert.equal(container.env.find(e => e.name === 'BENCHMARK_WORKERS').value, String(cpu));
  assert.equal(template.metadata.annotations['autoscaling.knative.dev/maxScale'], '1');
  assert.equal(template.metadata.annotations['run.googleapis.com/startup-cpu-boost'], 'false');
  assert.equal(template.metadata.annotations['run.googleapis.com/cpu-throttling'], 'true');
  assert.equal(template.spec.timeoutSeconds, 120);
  const successful = report.records.filter(r => r.status === 200);
  for (const r of successful) {
    const expected = fixture.cases.find(c => c.id === r.caseId);
    assert.ok(r.resultMatches);
    assert.equal(r.resultSha256, expected.expectedResultSha256);
    assert.equal(r.nodes, expected.phone.nodes);
    assert.equal(r.edges, expected.phone.edges);
  }
  const singles = fixture.cases.map(entry => {
    const first = report.records.filter(r => r.caseId === entry.id && r.phase === 'first-observed');
    const repeat = report.records.filter(r => r.caseId === entry.id && r.phase === 'repeat');
    assert.equal(first.length, 1);
    assert.equal(repeat.length, 3);
    assert.ok([...first, ...repeat].every(r => r.status === 200));
    return { caseId: entry.id, firstResponseMs: first[0].responseMs,
      calculationMs: median(repeat.map(r => r.calculationMs)), responseMs: median(repeat.map(r => r.responseMs)),
      cpuMs: median(repeat.map(r => r.cpuMs)), searchMs: median(repeat.map(r => r.searchMs)) };
  });
  const bursts = [1, 2, 4].map(concurrency => {
    const batches = [1, 2, 3].map(run => {
      const records = report.records.filter(r => r.phase === 'burst' && r.concurrency === concurrency && r.run === run);
      assert.equal(records.length, concurrency);
      return { run, responseCompletionMs: Math.max(...records.map(r => r.responseMs)),
        statuses: records.map(r => r.status ?? r.error), successful: records.filter(r => r.status === 200).length };
    });
    return { concurrency, batches, medianCompletionMs: median(batches.map(b => b.responseCompletionMs)),
      successful: batches.reduce((n, b) => n + b.successful, 0), requested: concurrency * 3 };
  });
  return { cpu, memoryGiB: cpu, workers: cpu, concurrency: cpu, revisionMaxInstances: 1,
    serviceMaxInstances: deployment.metadata.annotations['run.googleapis.com/maxScale'],
    revision: deployment.status.latestReadyRevisionName, image: container.image,
    recordedAt: report.recordedAt, completedAt: report.completedAt,
    successful: successful.length, failures: report.records.filter(r => r.status !== 200),
    maxWorkerRssBytes: Math.max(...successful.map(r => r.rssBytes)),
    maxWorkerLifetimeRssKiB: Math.max(...successful.map(r => r.processLifetimeMaxRssKiB)),
    maxParentRssBytes: Math.max(...successful.map(r => r.parentRssBytes)), singles, bursts, records: report.records };
});
assert.equal(experiments[0].image, experiments[1].image);
const iam = read('cloud-service-iam');
assert.ok(!(iam.bindings ?? []).some(b => b.members?.some(m => ['allUsers', 'allAuthenticatedUsers'].includes(m))));
const logs = read('cloud-run-logs');
const billable = read('cloud-billable-time');
const cloudEvidence = experiments.map(experiment => {
  const revisionLogs = logs.filter(log => log.resource?.labels.revision_name === experiment.revision);
  const requests = revisionLogs.filter(log => log.httpRequest);
  assert.equal(requests.length, 33);
  assert.equal(requests.filter(log => log.httpRequest.status === 200).length, experiment.successful);
  const ready = revisionLogs.filter(log => log.jsonPayload?.ready);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].jsonPayload.node, 'v24.21.0');
  assert.equal(ready[0].jsonPayload.workers, experiment.cpu);
  assert.ok(Date.parse(ready[0].timestamp) < Date.parse(experiment.recordedAt));
  const instanceCount = new Set(revisionLogs.map(log => log.labels?.instanceId).filter(Boolean)).size;
  assert.equal(instanceCount, 1);
  const series = billable.timeSeries.filter(s => s.resource.labels.revision_name === experiment.revision);
  assert.ok(series.length > 0);
  const seconds = series.flatMap(s => s.points).reduce((n, p) => n + p.value.doubleValue, 0);
  return { revision: experiment.revision, node: ready[0].jsonPayload.node, readyAt: ready[0].timestamp,
    observedInstances: instanceCount, requestLogCount: requests.length,
    error429Reason: requests.filter(log => log.httpRequest.status === 429).map(log => log.textPayload),
    billableInstanceSeconds: seconds, metricLatestEnd: series[0].points[0].interval.endTime,
    estimatedComputeMemoryUsdBeforeFreeCredits: seconds * experiment.cpu * (0.0000336 + 0.0000035) };
});
assert.deepEqual(read('cloud-services-after'), []);
assert.deepEqual(read('cloud-images-after'), []);
const sourceAfter = fs.readFileSync('.cache/server-compute/cloud-source-after.txt', 'utf8');
assert.ok(!sourceAfter.includes('.zip'));
const bucket = read('cloud-source-bucket');
const summary = { recordedAt: new Date().toISOString(), project: 'running-art-mobile', region: 'asia-northeast3',
  kind: 'Actual Cloud Run experiment, PC HTTPS client; not a phone network trial',
  requestCount: 66, immutableInput: fixture.cases.map(c => ({ id: c.id, inputSha256: c.inputSha256,
    expectedResultSha256: c.expectedResultSha256 })), experiments, cloudEvidence,
  cost: { currency: 'USD', unitCpuPerSecond: 0.0000336, unitGiBPerSecond: 0.0000035,
    computeMemoryEstimate: cloudEvidence.reduce((n, e) => n + e.estimatedComputeMemoryUsdBeforeFreeCredits, 0),
    requestEstimateFor66: 66 * 0.40 / 1000000,
    note: 'Monitoring-based estimate before free tier/credits, not an invoice. Build, artifact/source storage, network, tax excluded; telemetry may lag.' },
  cleanup: { servicesRemainingInSeoul: 0, benchmarkImagesRemaining: 0, activeSourceObjectsRemaining: 0,
    emptyRepositoryAndBucketRetained: true, sourceSoftDeleteRetentionSeconds: Number(bucket.soft_delete_policy.retentionDurationSeconds),
    note: 'Default source soft delete retains the deleted zip for 7 days; build history/logs and enabled APIs remain. No paid upgrade.' },
  caveats: ['First observed requests do not prove cold starts; inspect instance startup logs.',
    'Burst completion includes failures; a failed batch is not all-request success latency.',
    'RSS samples are per process, not simultaneous container memory peaks.',
    'Revision maximum is 1; the default service-level maximum was 20. Actual instances require log checks.',
    'Phone real-road full geometry was not exported; phone matching covers graph, routing and scores.'],
};
writeJson('docs/quality/cloud-run-compute-20261005.json', summary);
console.log(JSON.stringify({ requests: summary.requestCount, experiments: experiments.map(({ records, ...rest }) => rest) }, null, 2));
