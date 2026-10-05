// Public Seoul synthetic route only; no authentication or original records.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { migrateDatabase } from '../../src/modules/storage/migrations.ts';
import { createCourseRepository } from '../../src/modules/courses/repository.ts';
import { createRunRepository } from '../../src/modules/running/repository.ts';

const dir = '.cache/indoor-phone';
fs.mkdirSync(dir, { recursive: true });
if (['published', 'revoked'].includes(process.argv[2])) {
  const mode = process.argv[2];
  const { link } = JSON.parse(fs.readFileSync(dir + '/shared-link.json', 'utf8'));
  assert.match(link, /^https:\/\/runpen-shared-runs\.ssw3131\.workers\.dev\/#r\/[a-f0-9]{64}$/);
  const configResponse = await fetch('https://runpen-shared-runs.ssw3131.workers.dev/config.json', { signal: AbortSignal.timeout(25000) });
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.equal(new URL(config.apiUrl).origin, 'https://zymfblgzpidgfjjgrino.supabase.co');
  const response = await fetch(new URL('/rest/v1/rpc/read_run_share', config.apiUrl), {
    method: 'POST', headers: { apikey: config.publicKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: link.split('#r/')[1] }), signal: AbortSignal.timeout(25000),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  let result;
  if (mode === 'revoked') {
    assert.equal(payload, null);
    result = { anonymousResultNull: true };
  } else {
    assert.equal(payload.title, 'QA phone indoor synthetic');
    assert.equal(payload.segments.length, 2);
    assert.equal(payload.segments.flat().length, 232);
    assert.equal(payload.planned.route.length, 241);
    assert.equal(payload.planned.target.length, 241);
    for (const [x, y] of [...payload.segments.flat(), ...payload.planned.route, ...payload.planned.target]) {
      assert.ok(x > 126.9 && x < 127.1 && y > 37.5 && y < 37.6);
    }
    result = { syntheticOnly: true, segments: 2, points: 232, plannedPoints: 241, targetPoints: 241 };
  }
  fs.writeFileSync(dir + '/anonymous-' + mode + '.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  process.exit(0);
}
assert.ok(!fs.existsSync(dir + '/fixture.json'), 'Do not replace an existing fixture');
const db = openSqlite();
await migrateDatabase(db);
let now = Date.now() - 3600000;
const owner = '11111111-1111-4111-8111-111111111111';
const courses = createCourseRepository(db, () => now, () => owner);
const runs = createRunRepository(db, () => now, () => owner);
const target = Array.from({ length: 241 }, (_, i) => {
  const t = i / 240 * Math.PI * 2;
  return [126.978 + Math.pow(Math.sin(t), 3) * .005,
    37.5665 + (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) / 16 * .004];
});
const route = target.map(([x, y]) => [Math.round(x * 4000) / 4000, Math.round(y * 4000) / 4000]);
const course = await courses.save({ schemaVersion: 1, engineVersion: '0.2', source: 'osm', shape: 'heart',
  origin: { lng: 126.978, lat: 37.5665 }, targetKm: 3, lengthKm: 3, score: 90, route, target }, 'QA phone indoor synthetic');
const fix = i => ({ timestamp: now, longitude: route[i][0] + .000045*Math.sin(i), latitude: route[i][1] + .00004*Math.cos(i), accuracy: 5 });
const run = await runs.start(course.id, fix(0));
for (let i = 0; i < route.length; i++) {
  if (i === 95) { await runs.transition(run.id, 'paused'); now += 60000; await runs.transition(run.id, 'running'); i = 104; }
  await runs.append([fix(i)]); now += 15000;
}
await runs.transition(run.id, 'completed');
const courseId = '0505' + randomBytes(14).toString('hex');
const runId = '0505' + randomBytes(14).toString('hex');
const ids = new Map([[course.id, courseId], [run.id, runId]]);
const output = {};
for (const table of ['saved_courses', 'running_sessions', 'running_points']) {
  output[table] = (await db.getAllAsync('SELECT * FROM ' + table)).map(row => {
    for (const key of ['id', 'course_id', 'run_id']) if (ids.has(row[key])) row[key] = ids.get(row[key]);
    return row;
  });
}
assert.equal(output.saved_courses.length, 1);
assert.equal(output.running_sessions.length, 1);
assert.ok(output.running_points.length > 200);
assert.ok(output.running_points.every(p => p.longitude > 126.9 && p.longitude < 127.1 && p.latitude > 37.5 && p.latitude < 37.6));
fs.writeFileSync(dir + '/fixture.json', JSON.stringify(output));
fs.writeFileSync(dir + '/fixture-summary.json', JSON.stringify({ courseId, runId, points: output.running_points.length }, null, 2));
console.log(JSON.stringify({ syntheticCourses: 1, syntheticRuns: 1, points: output.running_points.length }));
await db.closeAsync();
