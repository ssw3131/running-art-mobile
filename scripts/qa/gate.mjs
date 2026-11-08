import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { checkGate } from './ci-policy.mjs';
const env = process.env;
const boolean = key => {
  if (!['true', 'false'].includes(env[key])) throw Error(`Invalid ${key}`);
  return env[key] === 'true';
};
const publish = checkGate({ event: env.GITHUB_EVENT_NAME, draft: boolean('DRAFT'), full: boolean('FULL'),
  reused: boolean('REUSED'), scope: env.SCOPE, fast: env.FAST, api: env.API, android: env.ANDROID, suite: env.SUITE });
if (publish) {
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  if (tree !== env.VERIFIED_TREE) throw Error('Scope and gate checked out different trees');
  mkdirSync('test-results/ci', { recursive: true });
  writeFileSync('test-results/ci/verified.json', JSON.stringify({ schemaVersion: 1, tree,
    source: env.GITHUB_SHA, run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    suites: ['fast', 'api', 'android-36', 'android-29'], status: 'passed' }, null, 2) + '\n');
}
console.log(publish ? 'Full PR verification receipt ready' : 'Gate passed for its declared scope');
