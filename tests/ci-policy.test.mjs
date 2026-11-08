import assert from 'node:assert/strict';
import test from 'node:test';
import { androidSelection, checkGate, classifyChanges } from '../scripts/qa/ci-policy.mjs';
import { findEvidence, validateEvidence } from '../scripts/qa/reuse-ci.mjs';
import { existsSync } from 'node:fs';
import { reviewPlan } from '../scripts/qa/change-review.mjs';

const passing = { event: 'pull_request', draft: false, full: true, reused: false,
  scope: 'success', fast: 'success', api: 'success', android: 'success' };
test('changed product areas route to existing contracts and tests without hiding unknown files', () => {
  const plan = reviewPlan(['src/features/service/HomeScreen.tsx', 'src/features/course-generation/GenerationConfirmationSheet.tsx',
    'src/features/running/RunScreen.tsx', 'src/features/achievements/ShareCard.tsx', 'src/new-area.ts']);
  assert.equal(plan.areas.length, 4);
  assert.deepEqual(plan.unclassified, ['src/new-area.ts']);
  assert.ok(plan.tests.includes('tests/components/point-address.test.tsx'));
  for (const file of [...plan.tests, ...plan.areas.map(a => a.contract)]) assert.ok(existsSync(file), file);
});
test('required gate rejects missing, cancelled and skipped required work', () => {
  assert.equal(checkGate(passing), true);
  for (const name of ['scope', 'fast', 'api', 'android']) {
    for (const status of ['failure', 'cancelled', 'skipped', undefined]) {
      assert.throws(() => checkGate({ ...passing, [name]: status }));
    }
  }
  assert.throws(() => checkGate({ ...passing, full: undefined }));
  assert.throws(() => checkGate({ ...passing, suite: 'fast' }));
});
test('draft, docs, manual and reused checks cannot publish a full PR receipt', () => {
  assert.equal(checkGate({ ...passing, draft: true, api: 'skipped', android: 'skipped' }), false);
  assert.equal(checkGate({ ...passing, event: 'workflow_dispatch', suite: 'fast', api: 'skipped', android: 'skipped' }), false);
  assert.equal(checkGate({ ...passing, full: false, fast: 'skipped', api: 'skipped', android: 'skipped' }), false);
  assert.equal(checkGate({ ...passing, event: 'push', reused: true, fast: 'skipped', api: 'skipped', android: 'skipped' }), false);
  assert.throws(() => checkGate({ ...passing, reused: true }));
  assert.throws(() => checkGate({ ...passing, event: 'push', draft: true }));
});
test('unknown paths remain full; native diagnostics require explicit manual selection', () => {
  for (const paths of [[], ['new-format.xyz'], ['src/app/index.tsx'], ['docs/a.md', 'package.json'], ['tests/visual/home.png']]) {
    assert.equal(classifyChanges(paths).full, true);
  }
  assert.equal(classifyChanges(['docs/a.md', 'README.md']).full, false);
  assert.deepEqual(androidSelection('pull_request').matrix, [36, 29]);
  assert.deepEqual(androidSelection('workflow_dispatch', 'generation'), { matrix: [36], argument: '--generation-only' });
  assert.throws(() => androidSelection('pull_request', 'visual'));
  assert.throws(() => androidSelection('workflow_dispatch', 'unknown'));
});

function evidence() {
  const repository = 'owner/app', commit = 'a'.repeat(40), tree = 'b'.repeat(40), head = 'c'.repeat(40);
  return { repository, commit, tree, now: Date.parse('2026-11-09'),
    pr: { number: 1, merged_at: '2026-11-09', merge_commit_sha: commit,
      base: { ref: 'main', repo: { full_name: repository } }, head: { sha: head, repo: { full_name: repository } } },
    run: { id: 123, run_attempt: 1, event: 'pull_request', path: '.github/workflows/verify.yml',
      repository: { full_name: repository }, head_repository: { full_name: repository }, head_sha: head,
      status: 'completed', conclusion: 'success', created_at: '2026-11-08T19:00:00Z' },
    jobs: ['scope', 'fast', 'api', 'android (36)', 'android (29)', 'verification-gate'].map(name => ({ name, status: 'completed', conclusion: 'success' })),
    artifacts: [{ name: `verified-${tree}-1`, expired: false, expires_at: '2026-11-15', digest: `sha256:${'d'.repeat(64)}`,
      workflow_run: { id: 123, head_sha: head } }],
  };
}
test('main accepts only exact-tree, same-repository, complete PR evidence', () => {
  assert.equal(validateEvidence(evidence()), true);
  const mutations = [
    e => { e.tree = 'e'.repeat(40); }, e => { e.pr.merge_commit_sha = 'e'.repeat(40); },
    e => { e.pr.merged_at = null; }, e => { e.pr.base.ref = 'other'; },
    e => { e.pr.head.repo.full_name = 'fork/app'; }, e => { e.run.head_repository.full_name = 'fork/app'; },
    e => { e.run.head_sha = 'e'.repeat(40); }, e => { e.run.path = '.github/workflows/other.yml'; },
    e => { e.run.event = 'workflow_dispatch'; }, e => { e.run.conclusion = 'failure'; },
    e => { e.run.status = 'in_progress'; }, e => { e.run.run_attempt = 2; },
    e => { e.jobs[4].conclusion = 'skipped'; }, e => { e.jobs[5].name = 'development-feedback'; },
    e => { e.jobs.push(e.jobs[0]); }, e => { e.artifacts = []; },
    e => { e.artifacts[0].expired = true; }, e => { e.artifacts[0].expires_at = '2026-11-01'; },
    e => { e.artifacts[0].workflow_run.id = 456; }, e => { e.artifacts[0].digest = null; },
  ];
  for (const mutate of mutations) { const e = evidence(); mutate(e); assert.equal(validateEvidence(e), false, mutate.toString()); }
});
test('a later failed run prevents reuse of an older successful run', async () => {
  const e = evidence();
  let calls = 0;
  const result = await findEvidence({ ...e, get: async path => {
    calls++;
    if (path.includes('/pulls?')) return [e.pr];
    if (path.includes('/workflows/')) return { workflow_runs: [e.run, { ...e.run, id: 124, created_at: '2026-11-09T01:00:00Z', conclusion: 'failure' }] };
    throw Error('Should not request stale proof');
  } });
  assert.equal(result.reused, false);
  assert.equal(calls, 2);
});
test('evidence discovery checks actual jobs and tree receipt, not head success alone', async () => {
  const e = evidence();
  e.artifacts[0].expires_at = '2099-01-01';
  const get = async path => {
    if (path.includes('/pulls?')) return [e.pr];
    if (path.includes('/workflows/')) return { workflow_runs: [e.run] };
    if (path.includes('/jobs?')) return { jobs: e.jobs, total_count: e.jobs.length };
    return { artifacts: e.artifacts, total_count: e.artifacts.length };
  };
  assert.equal((await findEvidence({ ...e, get })).reused, true);
  e.artifacts[0].name = 'unreviewed';
  assert.equal((await findEvidence({ ...e, get })).reused, false);
});
