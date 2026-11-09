import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classifyChanges } from './ci-policy.mjs';

const recordPath = /^docs\/quality\/change-reviews\/[a-z0-9-]+\.json$/;
export const requiresReview = file => classifyChanges([file]).full;
const meaningful = value => typeof value === 'string' && value.trim().length >= 8 && !/^(TODO|TBD|미정|작성 필요)/i.test(value.trim());

// Validate traceability, never infer whether a product decision is correct.
export function validateChangeReviews(changed, records, exists = existsSync) {
  const required = changed.filter(requiresReview);
  if (!required.length) return { required, errors: [] };
  const errors = [], covered = new Set();
  for (const { path, data: r } of records.filter(r => changed.includes(r.path) && recordPath.test(r.path))) {
    const fail = message => errors.push(`${path}: ${message}`);
    if (r?.schemaVersion !== 1) { fail('schemaVersion must be 1'); continue; }
    if (!Array.isArray(r.paths) || !r.paths.length || r.paths.some(p => !required.includes(p))) fail('paths must name changed product/test/QA/config files exactly');
    else r.paths.forEach(p => covered.add(p));
    if (!['changed', 'preserved'].includes(r.behavior)) fail('behavior must be changed or preserved');
    for (const key of ['decision', 'before', 'after']) if (!meaningful(r[key])) fail(`${key}: explain the decision and before/after behavior`);
    if (!Array.isArray(r.invariants) || !r.invariants.length || !r.invariants.every(meaningful)) fail('record preserved behavior/data invariants');
    if (!Array.isArray(r.tests) || !r.tests.length) fail('record regression paths and reasons');
    else for (const t of r.tests) {
      if (typeof t.path !== 'string' || !/^(tests\/|scripts\/qa\/test_)/.test(t.path) || t.path.includes('..') || !exists(t.path)) fail('test path must exist inside tests/ or scripts/qa/test_');
      if (!meaningful(t.reason)) fail('test reason is required, including why an unchanged test remains sufficient');
    }
    if (!['changed', 'unchanged', 'not-applicable'].includes(r.visual?.status) || !meaningful(r.visual?.reason)) fail('record visual review status and reason');
    if (r.visual?.status === 'changed' && (!Array.isArray(r.visual.evidence) || !r.visual.evidence.length || !r.visual.evidence.every(meaningful))) fail('changed visuals need original/baseline/diff review evidence');
    if (!meaningful(r.native)) fail('record required native diagnostics, or why they are not needed');
  }
  for (const file of required) if (!covered.has(file)) errors.push(`검토 기록 누락: ${file}`);
  return { required, errors };
}

export function readChangeReviews(base, { working = false } = {}) {
  const resolved = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`], { encoding: 'utf8' }).trim();
  const changed = execFileSync('git', ['diff', '--name-only', '-z', resolved, ...(working ? [] : ['HEAD'])], { encoding: 'utf8' }).split('\0').filter(Boolean);
  if (working) changed.push(...execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
  const records = [], parseErrors = [];
  for (const path of [...new Set(changed)].filter(p => recordPath.test(p))) {
    if (!existsSync(path)) continue;
    try { records.push({ path, data: JSON.parse(readFileSync(path, 'utf8')) }); }
    catch { parseErrors.push(`${path}: invalid JSON`); }
  }
  const result = validateChangeReviews([...new Set(changed)], records);
  return { ...result, errors: [...parseErrors, ...result.errors], records: records.map(r => r.path) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = readChangeReviews(process.argv[2] || 'main', { working: process.argv.includes('--working') });
  console.log(JSON.stringify(result, null, 2));
  console.log('기록의 연결/누락 검사입니다. 기대 동작의 정확성은 최신 결정과 직접 대조합니다.');
  if (result.errors.length && !process.argv.includes('--advisory')) process.exitCode = 1;
}
