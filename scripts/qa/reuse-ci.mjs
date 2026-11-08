import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const requiredJobs = ['scope', 'fast', 'api', 'android (36)', 'android (29)', 'verification-gate'];
const sha = value => /^[a-f0-9]{40}$/.test(value ?? '');

// Require a gate receipt for the exact checkout tree AND both native jobs.
export function validateEvidence({ repository, commit, tree, pr, run, jobs, artifacts, now = Date.now() }) {
  if (!sha(commit) || !sha(tree) || !pr?.merged_at || pr.merge_commit_sha !== commit || pr.base?.ref !== 'main'
    || pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository) return false;
  if (run?.event !== 'pull_request' || run.path !== '.github/workflows/verify.yml'
    || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository
    || run.head_sha !== pr.head.sha || run.status !== 'completed' || run.conclusion !== 'success'
    || !Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) return false;
  if (!requiredJobs.every(name => {
    const matches = jobs.filter(job => job.name === name);
    return matches.length === 1 && matches[0].status === 'completed' && matches[0].conclusion === 'success';
  })) return false;
  return artifacts.some(a => a.name === `verified-${tree}-${run.run_attempt}` && a.expired === false
    && Date.parse(a.expires_at) > now && /^sha256:[a-f0-9]{64}$/.test(a.digest ?? '')
    && a.workflow_run?.id === run.id && a.workflow_run?.head_sha === run.head_sha);
}

export async function findEvidence({ repository, commit, tree, get }) {
  const root = `/repos/${repository}`;
  const prs = await get(`${root}/commits/${commit}/pulls?per_page=100`);
  const matches = prs.filter(pr => pr.merged_at && pr.merge_commit_sha === commit && pr.base?.ref === 'main');
  if (matches.length !== 1) return { reused: false, reason: 'No unique merged PR for this commit' };
  const pr = matches[0];
  if (!sha(pr.head?.sha)) return { reused: false, reason: 'Missing PR head' };
  const runs = await get(`${root}/actions/workflows/verify.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=20`);
  // Never hide a later failure behind an older successful run of the same head.
  const run = runs.workflow_runs.filter(r => r.head_sha === pr.head.sha)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)[0];
  if (!run || run.status !== 'completed' || run.conclusion !== 'success') return { reused: false, reason: 'Latest PR verification is not successful' };
  const [jobData, artifactData] = await Promise.all([
    get(`${root}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`),
    get(`${root}/actions/runs/${run.id}/artifacts?per_page=100`),
  ]);
  if (jobData.total_count > 100 || artifactData.total_count > 100
    || !validateEvidence({ repository, commit, tree, pr, run, jobs: jobData.jobs, artifacts: artifactData.artifacts })) {
    return { reused: false, reason: 'Exact-tree full verification evidence unavailable' };
  }
  return { reused: true, reason: 'Same Git tree, successful full PR verification', pr: pr.number,
    run: run.id, attempt: run.run_attempt, tree, url: `https://github.com/${repository}/actions/runs/${run.id}` };
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const commit = process.env.GITHUB_SHA;
  if (process.env.GITHUB_EVENT_NAME !== 'push' || process.env.GITHUB_REF !== 'refs/heads/main'
    || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !sha(commit)) throw Error('Expected main push context');
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  let result;
  try {
    result = await findEvidence({ repository, commit, tree, get: async path => {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error(`GitHub evidence request failed (${response.status})`);
      return response.json();
    } });
  } catch (error) {
    // Missing permissions, expired artifacts or outages cost time, never coverage.
    result = { reused: false, reason: `Evidence unavailable; full verification required: ${error.message}` };
  }
  mkdirSync('test-results/ci', { recursive: true });
  writeFileSync('test-results/ci/reuse.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  appendFileSync(process.env.GITHUB_OUTPUT, `reused=${result.reused}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Main verification\n\n${result.reason}\n\n${result.url ? `[Reused full PR run](${result.url}) — tree \`${tree}\`` : 'Running all required suites.'}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
