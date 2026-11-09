import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const seconds = (a, b) => a && b && Number.isFinite(Date.parse(a)) && Number.isFinite(Date.parse(b))
  ? Math.max(0, (Date.parse(b) - Date.parse(a)) / 1000) : null;
const earliest = values => values.filter(Boolean).sort()[0] ?? null;
const latest = values => values.filter(Boolean).sort().at(-1) ?? null;
const active = job => job.conclusion !== 'skipped';
const categories = ['product', 'test-contract', 'environment', 'unclassified'];

export function summarizeAttempt(run, jobs) {
  const start = run.run_started_at || earliest(jobs.map(j => j.started_at));
  const end = run.status === 'completed' ? latest(jobs.map(j => j.completed_at)) : null;
  const failures = jobs.filter(j => ['failure', 'timed_out', 'action_required', 'startup_failure'].includes(j.conclusion))
    .map(j => ({ job: j.name, jobId: j.id, completedAt: j.completed_at,
      step: j.steps?.find(s => s.conclusion === 'failure')?.name ?? null,
      observedAt: j.steps?.find(s => s.conclusion === 'failure')?.completed_at || j.completed_at }));
  const android = jobs.filter(j => /^(android \((29|36)\)|diagnostic \([a-z]+\))$/.test(j.name) && active(j));
  const reuseStep = jobs.find(j => j.name === 'scope')?.steps?.find(s => s.name === 'Verify identical-tree PR evidence before reusing main results');
  const nativeJobs = jobs.filter(j => /^(android|diagnostic)( |$)/.test(j.name));
  const skippedSuites = ['fast', 'api'].every(name => jobs.some(j => j.name === name && j.conclusion === 'skipped'))
    && nativeJobs.length > 0 && nativeJobs.every(j => j.conclusion === 'skipped');
  const reused = run.event === 'push' && reuseStep?.conclusion === 'success' && skippedSuites
    && jobs.some(j => j.name === 'verification-gate' && j.conclusion === 'success');
  const kind = reused ? 'reused-main' : android.length ? (run.event === 'workflow_dispatch' ? 'diagnostic' : 'full')
    : jobs.some(j => j.name === 'fast' && active(j)) ? 'fast' : 'docs-or-setup';
  return { schemaVersion: 1, runId: run.id, attempt: run.run_attempt, event: run.event,
    headSha: run.head_sha, branch: run.head_branch, url: run.html_url,
    prNumbers: (run.pull_requests || []).map(p => p.number), kind, status: run.status, conclusion: run.conclusion,
    createdAt: run.created_at, startedAt: start, finishedAt: end,
    queueSeconds: run.run_attempt === 1 ? seconds(run.created_at, start) : null,
    durationSeconds: seconds(start, end), firstFailureSeconds: seconds(start, earliest(failures.map(f => f.observedAt))),
    failures, jobs: jobs.map(j => ({ id: j.id, name: j.name, conclusion: j.conclusion,
      durationSeconds: active(j) ? seconds(j.started_at, j.completed_at) : null,
      steps: (j.steps || []).map(s => ({ name: s.name, conclusion: s.conclusion,
        durationSeconds: s.conclusion === 'skipped' ? null : seconds(s.started_at, s.completed_at) })) })) };
}

function distribution(values) {
  const sorted = values.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  const n = sorted.length;
  return { n, median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
    p95: n ? sorted[Math.ceil(n * .95) - 1] : null };
}

export function aggregate(prs, attempts, annotations) {
  // Re-running a workflow must retain its first failure, but repeated snapshots
  // of one attempt must not inflate counts.
  const unique = [...new Map(attempts.map(a => [`${a.runId}:${a.attempt}`, a])).values()];
  const rows = prs.map(pr => {
    const runs = unique.filter(a => a.event === 'pull_request' && a.prNumbers.includes(pr.number));
    return { number: pr.number, state: pr.state, mergedAt: pr.merged_at, url: pr.html_url,
      attempts: runs.length, fullAttempts: runs.filter(a => a.kind === 'full').length,
      failedAttempts: runs.filter(a => a.failures.length).length,
      cancelledAttempts: runs.filter(a => a.conclusion === 'cancelled').length,
      firstFailures: distribution(runs.map(a => a.firstFailureSeconds)),
      postMergeReview: annotations.postMergeReviews.find(r => r.pr === pr.number) ?? null };
  });
  const selected = unique.filter(a => a.event === 'pull_request' && a.prNumbers.some(n => prs.some(p => p.number === n)));
  const failureCauses = Object.fromEntries(categories.map(c => [c, 0]));
  for (const run of selected.filter(a => a.failures.length)) {
    const entry = annotations.failures.find(f => f.runId === run.runId && f.attempt === run.attempt);
    const category = entry && categories.includes(entry.category) && entry.evidence?.trim() ? entry.category : 'unclassified';
    failureCauses[category]++;
  }
  const main = unique.filter(a => a.event === 'push' && a.branch === 'main' && ['full', 'reused-main'].includes(a.kind));
  return { prs: rows, prCount: rows.length, mergedCount: rows.filter(p => p.mergedAt).length,
    checkpoint: rows.filter(p => p.mergedAt).length >= 20 ? '20 PR 검토 시점' : rows.filter(p => p.mergedAt).length >= 10 ? '10 PR 중간 검토 시점' : '관측 중: 효과 확정 전',
    fullSuccessSeconds: distribution(selected.filter(a => a.kind === 'full' && a.conclusion === 'success').map(a => a.durationSeconds)),
    firstFailureSeconds: distribution(selected.map(a => a.firstFailureSeconds)), failureCauses,
    mainReuse: { reused: main.filter(a => a.kind === 'reused-main').length, eligibleObserved: main.length },
    postMergeReviewCount: rows.filter(p => p.postMergeReview).length,
    reportedRegressions: rows.flatMap(p => p.postMergeReview?.regressions || []).length };
}

export function markdown(report) {
  const d = report.summary;
  const value = v => v === null ? '미관측' : `${Math.round(v)}초`;
  return `# CI 관측\n\n관측 시작: ${report.since}\n\n${d.checkpoint}. 대상 PR ${d.prCount}개, 병합 ${d.mergedCount}개.\n\n`
    + `전체 성공 시간: 중앙값 ${value(d.fullSuccessSeconds.median)}, P95 ${value(d.fullSuccessSeconds.p95)} (n=${d.fullSuccessSeconds.n}).\n\n`
    + `실행 시작부터 첫 실패까지: 중앙값 ${value(d.firstFailureSeconds.median)} (n=${d.firstFailureSeconds.n}). 대기열·PR 작성/수정 시간과 구분합니다.\n\n`
    + `main 재사용 ${d.mainReuse.reused}/${d.mainReuse.eligibleObserved} (문서 전용 제외).\n\n`
    + `실패 실행 분류: ${JSON.stringify(d.failureCauses)}. 취소는 실패 원인에 포함하지 않습니다.\n\n`
    + `병합 후 회귀: 기록된 ${d.reportedRegressions}건 / 관찰 검토 ${d.postMergeReviewCount} PR. 미검토는 회귀 0건을 뜻하지 않습니다.\n\n`
    + '| PR | 실행 회차 | 전체 검사 회차 | 실패 | 취소 | 병합 후 관찰 |\n|---|---:|---:|---:|---:|---|\n'
    + d.prs.map(p => `| [#${p.number}](${p.url}) | ${p.attempts} | ${p.fullAttempts} | ${p.failedAttempts} | ${p.cancelledAttempts} | ${p.postMergeReview ? '기록 있음' : '미검토'} |`).join('\n')
    + '\n\n원본 JSON에 실행/회차/작업별 시간과 실패 단계가 있습니다. 일부 실행은 조회 시 진행 중일 수 있습니다. 실패 원인은 증거를 검토한 분류만 인정합니다.\n';
}

export async function githubClient(repository, token) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw Error('Invalid repository');
  const get = async path => {
    if (!path.startsWith(`/repos/${repository}/`)) throw Error('Unexpected API path');
    const response = await fetch(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`GitHub metrics request failed (${response.status}): ${path}`);
    return response.json();
  };
  const pages = async (path, key) => {
    const all = [];
    for (let page = 1; page <= 100; page++) {
      const data = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const items = key ? data[key] : data;
      if (!Array.isArray(items)) throw Error('Unexpected API collection');
      all.push(...items);
      if (items.length < 100) return all;
    }
    throw Error('Metrics pagination limit reached; refusing a partial report');
  };
  return { get, pages };
}

export async function collectRun(client, root, id) {
  const run = await client.get(`${root}/actions/runs/${id}`);
  if (run.path !== '.github/workflows/verify.yml') throw Error('Expected Verify workflow');
  const attempts = [];
  for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
    const detail = await client.get(`${root}/actions/runs/${id}/attempts/${attempt}`);
    const jobs = await client.pages(`${root}/actions/runs/${id}/attempts/${attempt}/jobs`, 'jobs');
    const summary = summarizeAttempt(detail, jobs);
    if (detail.event === 'pull_request' && !summary.prNumbers.length) {
      const prs = await client.pages(`${root}/commits/${detail.head_sha}/pulls`);
      summary.prNumbers = prs.filter(p => p.base.ref === 'main').map(p => p.number);
    }
    attempts.push(summary);
  }
  return attempts;
}

async function main() {
  const mode = process.argv[2];
  const config = JSON.parse(readFileSync('docs/quality/ci-observation.json', 'utf8'));
  const repository = process.env.GITHUB_REPOSITORY || config.repository;
  const client = await githubClient(repository, process.env.GH_TOKEN);
  const root = `/repos/${repository}`;
  const out = process.env.QA_METRICS_OUT || 'test-results/ci-metrics';
  mkdirSync(out, { recursive: true });
  if (mode === 'snapshot') {
    const id = process.argv[3];
    if (!/^\d+$/.test(id || '')) throw Error('Pass a workflow run ID');
    const attempts = await collectRun(client, root, id);
    writeFileSync(`${out}/run-${id}.json`, JSON.stringify({ collectedAt: new Date().toISOString(), attempts }, null, 2) + '\n');
    console.log(JSON.stringify(attempts.map(a => ({ run: a.runId, attempt: a.attempt, kind: a.kind, seconds: a.durationSeconds, failures: a.failures.length }))));
    return;
  }
  if (mode !== 'window') throw Error('Expected snapshot or window');
  const prs = [];
  // REST pulls has no created-since filter: stop once the descending page passes
  // the boundary rather than silently sampling the latest page.
  for (let page = 1; ; page++) {
    if (page > 100) throw Error('PR pagination limit reached');
    const batch = await client.get(`${root}/pulls?state=all&base=main&sort=created&direction=desc&per_page=100&page=${page}`);
    prs.push(...batch.filter(p => p.created_at >= config.since));
    if (batch.length < 100 || batch.at(-1).created_at < config.since) break;
  }
  const selected = [];
  for (const pr of prs.sort((a, b) => a.number - b.number)) {
    const files = await client.pages(`${root}/pulls/${pr.number}/files`);
    const { classifyChanges } = await import('./ci-policy.mjs');
    if (classifyChanges(files.map(f => f.filename)).full) selected.push(pr);
    if (selected.length === config.targetPrCount) break;
  }
  const runs = await client.pages(`${root}/actions/workflows/verify.yml/runs?created=${encodeURIComponent('>=' + config.since)}`, 'workflow_runs');
  const attempts = [];
  // Retain all failures and original attempts; a successful rerun never erases them.
  for (const run of runs) attempts.push(...await collectRun(client, root, run.id));
  const report = { schemaVersion: 1, collectedAt: new Date().toISOString(), since: config.since,
    targetPrCount: config.targetPrCount, summary: aggregate(selected, attempts, config), attempts };
  const rendered = markdown(report);
  writeFileSync(`${out}/window.json`, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(`${out}/window.md`, rendered);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, rendered);
  console.log(rendered);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
