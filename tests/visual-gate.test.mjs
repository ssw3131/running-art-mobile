import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('VISUAL-GATE-01: missing or mismatched baselines cannot report a visual pass', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'runpen-visual-gate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = path.join(root, 'attempt-01'); mkdirSync(folder);
  const screen = { id: 'home', file: path.resolve('docs/quality/screenshots/service-s0-20261012/01-home.png') };
  const manifest = { environment: { api: '36', density: 420 }, screens: [screen] };
  writeFileSync(path.join(folder, 'screens.json'), JSON.stringify(manifest));
  const baseline = path.join(root, 'baseline.json');
  const run = () => spawnSync(process.execPath, ['scripts/qa/visual-suite.mjs', root, baseline], { encoding: 'utf8' });
  const report = () => JSON.parse(readFileSync(path.join(root, 'visual-report.json')));
  assert.equal(run().status, 1); assert.equal(report().results[0].status, 'not_run');
  writeFileSync(baseline, JSON.stringify({ ...manifest, reviewed: true, environment: { api: '29', density: 420 } }));
  assert.equal(run().status, 1); assert.equal(report().results[0].status, 'not_run');
  writeFileSync(baseline, JSON.stringify({ ...manifest, reviewed: true }));
  assert.equal(run().status, 0); assert.equal(report().status, 'passed');
});
