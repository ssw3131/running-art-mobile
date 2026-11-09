import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregate, collectRun, summarizeAttempt } from '../scripts/qa/ci-metrics.mjs';

const start = '2026-11-09T06:00:00Z', finish = '2026-11-09T06:10:00Z';
const run = { id: 10, run_attempt: 1, event: 'pull_request', status: 'completed', conclusion: 'failure',
  run_started_at: start, created_at: start, pull_requests: [{ number: 55 }] };
const job = { id: 1, name: 'android (36)', conclusion: 'failure', started_at: start, completed_at: finish,
  steps: [{ name: 'Emulator', conclusion: 'failure', started_at: start, completed_at: '2026-11-09T06:09:00Z' }] };
test('failure latency uses the failing step, elapsed time is not summed across parallel jobs', () => {
  const report = summarizeAttempt(run, [job, { ...job, id: 2, name: 'android (29)', conclusion: 'success', steps: [] }]);
  assert.equal(report.durationSeconds, 600);
  assert.equal(report.firstFailureSeconds, 540);
  assert.equal(report.failures.length, 1);
});
test('docs skips cannot be mistaken for successful same-tree reuse', () => {
  const jobs = ['fast', 'api', 'android'].map(name => ({ name, conclusion: 'skipped' }));
  jobs.push({ name: 'verification-gate', conclusion: 'success' });
  assert.equal(summarizeAttempt({ ...run, event: 'push' }, jobs).kind, 'docs-or-setup');
  jobs.push({ name: 'scope', steps: [{ name: 'Verify identical-tree PR evidence before reusing main results', conclusion: 'success' }] });
  assert.equal(summarizeAttempt({ ...run, event: 'push' }, jobs).kind, 'reused-main');
  jobs.find(j => j.name === 'android').name = "matrix.scenario == 'full' && format('android ({0})', matrix.api) || format('diagnostic ({0})', matrix.scenario)";
  assert.equal(summarizeAttempt({ ...run, event: 'push' }, jobs).kind, 'reused-main');
});
test('deduplicate snapshots, preserve failures before rerun success, and keep unknown causes unknown', () => {
  const failed = summarizeAttempt(run, [job]);
  const passed = summarizeAttempt({ ...run, run_attempt: 2, conclusion: 'success' }, [{ ...job, conclusion: 'success', steps: [] }]);
  const summary = aggregate([{ number: 55 }], [failed, failed, passed], { failures: [], postMergeReviews: [] });
  assert.equal(summary.prs[0].fullAttempts, 2);
  assert.equal(summary.prs[0].failedAttempts, 1);
  assert.equal(summary.failureCauses.unclassified, 1);
  assert.equal(summary.fullSuccessSeconds.n, 1);
  assert.equal(summary.postMergeReviewCount, 0);
});
test('collector reads every attempt rather than hiding the initial failure', async () => {
  const calls = [];
  const result = await collectRun({ get: async p => {
    calls.push(p);
    return { ...run, path: '.github/workflows/verify.yml', run_attempt: p.endsWith('/1') ? 1 : 2 };
  }, pages: async p => { calls.push(p); return [job]; } }, '/repos/owner/app', 10);
  assert.equal(result.length, 2);
  assert.ok(calls.some(p => p.endsWith('/attempts/1/jobs')));
});
test('cancellation and unreviewed post-merge behavior never count as a confirmed regression-free result', () => {
  const cancelled = summarizeAttempt({ ...run, conclusion: 'cancelled' }, [{ ...job, conclusion: 'cancelled', steps: [] }]);
  const summary = aggregate([{ number: 55, merged_at: finish }], [cancelled], { failures: [], postMergeReviews: [] });
  assert.equal(summary.prs[0].cancelledAttempts, 1);
  assert.equal(summary.failureCauses.unclassified, 0);
  assert.equal(summary.firstFailureSeconds.n, 0);
  assert.equal(summary.prs[0].postMergeReview, null);
});

test('reuse denominator includes only observed target PRs; a review without evidence remains unknown', () => {
  const main = { ...summarizeAttempt(run, []), event: 'push', branch: 'main', kind: 'reused-main' };
  const summary = aggregate([{ number: 55 }], [main, { ...main, runId: 11, prNumbers: [99] }],
    { failures: [], postMergeReviews: [{ pr: 55, regressions: [] }] });
  assert.deepEqual(summary.mainReuse, { reused: 1, eligibleObserved: 1 });
  assert.equal(summary.postMergeReviewCount, 0);
});

test('manual diagnostics remain visible without being counted as a required full PR pass', () => {
  const diagnostic = summarizeAttempt({ ...run, event: 'workflow_dispatch', conclusion: 'success' },
    [{ ...job, name: 'diagnostic (service)', conclusion: 'success', steps: [] }]);
  const summary = aggregate([{ number: 55 }], [diagnostic], { failures: [], postMergeReviews: [] });
  assert.equal(summary.prs[0].attempts, 1);
  assert.equal(summary.prs[0].manualAttempts, 1);
  assert.equal(summary.prs[0].fullAttempts, 0);
  assert.equal(summary.fullSuccessSeconds.n, 0);
});

test('workflow failures without job details are unknown failures, not zero failures or invented timings', () => {
  const failed = summarizeAttempt(run, []);
  const summary = aggregate([{ number: 55 }], [failed], { failures: [], postMergeReviews: [] });
  assert.equal(summary.prs[0].failedAttempts, 1);
  assert.equal(summary.failureCauses.unclassified, 1);
  assert.equal(summary.firstFailureSeconds.n, 0);
});
