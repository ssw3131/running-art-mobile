import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [root, baseline] = process.argv.slice(2);
if (!root || !baseline) throw Error('Usage: visual-suite.mjs android-results baseline.json');
const attempts = readdirSync(root).filter(name => /^attempt-\d{2}$/.test(name)).sort();
const results = [];
for (const attempt of attempts) {
  const actual = path.join(root, attempt, 'screens.json');
  if (!existsSync(actual)) { results.push({ attempt, status: 'not_run', reason: 'Functional capture incomplete' }); continue; }
  const out = path.join(root, attempt, 'visual');
  const run = spawnSync(process.execPath, ['scripts/qa/visual.mjs', baseline, actual, out], { encoding: 'utf8' });
  const reportFile = path.join(out, 'report.json');
  const report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile)) : { status: 'environment_failure', reason: run.stderr };
  results.push({ attempt, ...report });
  console.log(`${attempt}: ${report.status}`);
}
const status = results.length && results.every(result => result.status === 'passed') ? 'passed' : 'failed';
writeFileSync(path.join(root, 'visual-report.json'), JSON.stringify({ status, baseline, results }, null, 2));
process.exitCode = status === 'passed' ? 0 : 1;
