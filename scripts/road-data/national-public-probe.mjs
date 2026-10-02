import assert from 'node:assert/strict';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { createRoadCache, migrateRoadCache } from '../../src/modules/road-data/persistent-cache.ts';
import { createRoadLoader } from '../../src/modules/road-data/client.ts';
import { readJson, writeJson, sha256, codecs } from './common.mjs';

// Run in separate processes around real pointer switches, sharing one SQLite
// database. Refresh must see the expected public release; offline must make no
// network requests. The expected full input comes from an independent source scan.
const { values } = parseArgs({ options: {
  bundle: { type: 'string' }, database: { type: 'string' }, report: { type: 'string' },
  mode: { type: 'string', default: 'refresh' }, case: { type: 'string', default: 'region-corner-10km' },
} });
assert.ok(values.bundle && values.database && values.report, '--bundle, --database and --report are required');
assert.ok(['refresh', 'offline'].includes(values.mode));
const expected = readJson(path.join(values.bundle, 'verification-report.json')).records.find(r => r.id === values.case);
assert.ok(expected, 'Source-verified case required');
const release = readJson(path.join(values.bundle, 'catalog.json')).release;
const db = openSqlite(values.database);
await migrateRoadCache(db);
const cache = createRoadCache(db, codecs);
let requests = 0;
const load = createRoadLoader({ supply: 'national', getCache: async () => cache, timeoutMs: 180000,
  fetcher: (url, init) => {
    requests++;
    assert.notEqual(values.mode, 'offline', 'Offline probe attempted a network request');
    return fetch(url, init);
  },
});
try {
  const started = performance.now();
  const result = await load(expected.origin, expected.radiusMeters, new AbortController().signal, values.mode);
  const inputSha256 = sha256(JSON.stringify(result.elements));
  assert.equal(result.cache.release, release);
  assert.equal(inputSha256, expected.inputSha256, 'Public input differs from original source');
  if (values.mode === 'offline') assert.equal(requests, 0);
  const report = { recordedAt: new Date().toISOString(), transport: values.mode === 'offline' ? 'persisted SQLite, no network' : 'public R2 HTTPS',
    mode: values.mode, case: expected.id, database: values.database, requests,
    elapsedMs: performance.now() - started, inputSha256, ...result.cache, status: await cache.status() };
  writeJson(values.report, report);
  console.log(JSON.stringify(report));
} finally { await cache.close(); }
