import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const suite = process.argv[2] ?? 'fast';
const out = path.resolve(process.env.QA_OUT ?? `test-results/${suite}`); mkdirSync(out, { recursive: true });
const npmCli = process.env.npm_execpath;
const npm = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const npmArgs = script => npmCli ? [npmCli, 'run', script] : ['run', script];
const steps = {
  fast: [ ['source', npm, npmArgs('check')], ['server-source', npm, npmArgs('check:server')],
    ['logic', process.execPath, ['--test', 'tests/*.test.mjs']],
    ['components', npm, npmArgs('test:components')],
    ['openapi', process.execPath, ['scripts/qa/openapi.mjs', '--check']],
    ['account-policies', process.execPath, ['scripts/qa/account-server.mjs']],
    ['share-policies', process.execPath, ['scripts/qa/run-sharing-server.mjs']] ],
  integration: [['supabase-roundtrip', process.execPath, ['--test', 'tests/integration/*.test.mjs']]],
};
if (!steps[suite]) throw Error('Expected fast or integration');
const report = { schemaVersion: 1, suite, startedAt: new Date().toISOString(),
  source: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
  dirty: Boolean(spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim()),
  workingTree: spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean),
  ciRun: process.env.GITHUB_RUN_ID ?? null,
  fixtureSha256: createHash('sha256').update(readFileSync('assets/route-lab/grid.json')).digest('hex'),
  environment: { platform: process.platform, node: process.version }, retry: 0, steps: [] };
let failed = false;
for (const [id, command, args] of steps[suite]) {
  const start = Date.now(); console.log(`Running ${id}`);
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' && command === 'npm.cmd', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  const status = result.error ? 'environment_failure' : result.status === 0 ? 'passed' : 'failed';
  writeFileSync(path.join(out, `${id}.log`), (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.message ?? ''));
  report.steps.push({ id, status, exitCode: result.status, durationMs: Date.now() - start, log: `${id}.log` });
  console.log(`${id}: ${status}`); if (status !== 'passed') failed = true;
  // No retries. Continue independent checks so the report retains all failures.
}
report.finishedAt = new Date().toISOString(); report.status = failed ? 'failed' : 'passed';
writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(path.join(out, 'report.md'), `Source: ${report.source} (dirty=${report.dirty})\n\n| Scenario | Status | Evidence |\n|---|---|---|\n` + report.steps.map(step => `| ${step.id} | ${step.status} | [log](${step.log}) |`).join('\n') + '\n');
process.exitCode = failed ? 1 : 0;
