import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { androidJobs, androidSelection, classifyChanges } from './ci-policy.mjs';
const base = process.argv[2];
if (base !== '--all' && !/^[a-f0-9]{40}$/.test(base ?? '')) throw Error('Pass the event base SHA');
const changed = base === '--all' ? [] : execFileSync('git', ['diff', '--name-only', '-z', base, 'HEAD'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const result = classifyChanges(changed);
const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
const selection = androidSelection(process.env.GITHUB_EVENT_NAME ?? 'pull_request', process.env.ANDROID_SCENARIO || 'full');
const jobs = androidJobs(process.env.GITHUB_EVENT_NAME ?? 'pull_request', process.env.ANDROID_SCENARIO || 'full');
console.log(JSON.stringify({ ...result, tree, ...selection }, null, 2));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
  `full=${result.full}\ntree=${tree}\nmatrix=${JSON.stringify(selection.matrix)}\nandroid_argument=${selection.argument}\nandroid_jobs=${JSON.stringify(jobs)}\n`);
