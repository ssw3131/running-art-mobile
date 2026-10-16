import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeAchievements, calendarDay } from '../src/modules/achievements/model.ts';
import { createAchievementsRepository } from '../src/modules/achievements/repository.ts';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { openSqlite } from './helpers/sqlite.mjs';

const at = day => new Date(2026, 9, day, 12).getTime();
const run = (id, day, more = {}) => ({ id, status: 'completed', startedAt: at(day), distanceM: 3000, activeMs: 900000, courseId: 'course', courseOutcome: 'finished', shape: 'heart', ...more });
test('awards are stable on restore/retry, retroactive, and revoked by record deletion', () => {
  const first = run('a', 10), second = run('b', 11), stopped = run('c', 12, { courseOutcome: 'stopped' });
  const totals = summarizeAchievements([second, first, first, stopped, run('d', 12, { status: 'paused' })], at(12));
  assert.equal(totals.runs, 3); assert.equal(totals.finishedCourses, 2); assert.equal(totals.distanceM, 9000);
  assert.deepEqual(totals.badges, [{ id: 'shape:heart', shape: 'heart', count: 2, firstRunId: 'a', firstAt: at(10), latestAt: at(11) }]);
  const deleted = summarizeAchievements([second, stopped], at(12));
  assert.equal(deleted.badges[0].count, 1); assert.equal(deleted.badges[0].firstRunId, 'b');
  assert.equal(summarizeAchievements([stopped], at(12)).badges.length, 0);
});
test('streak uses unique local start days, yesterday grace, free/stopped runs, and excludes zero distance', () => {
  const records = [run('a', 10), run('b', 10), run('c', 11, { courseId: null, courseOutcome: null, shape: null }), run('d', 12, { courseOutcome: 'stopped' }), run('e', 13, { distanceM: 0 })];
  assert.equal(summarizeAchievements(records, at(13)).currentStreak, 3);
  assert.equal(summarizeAchievements(records, at(14)).currentStreak, 0);
  assert.equal(summarizeAchievements(records, at(14)).longestStreak, 3);
  assert.equal(summarizeAchievements(records, at(14)).activeDays, 3);
  assert.equal(calendarDay(new Date(2026, 10, 2, 0).getTime()) - calendarDay(new Date(2026, 10, 1, 0).getTime()), 1);
});
test('real SQLite aggregation scopes owner, survives old records, and never modifies originals', async t => {
  const db = openSqlite(); t.after(() => db.closeAsync()); await migrateDatabase(db);
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let owner = A; const repo = createAchievementsRepository(db, () => owner);
  for (const [id, who, shape] of [['1', A, 'heart'], ['2', B, 'fish']]) await db.runAsync(`INSERT INTO running_sessions(id,owner_id,status,started_at,checkpoint_at,resumed_at,course_id,course_outcome,course_snapshot_json,distance_m,active_ms)
    VALUES(?,?,'completed',1,1,1,'course','finished',?,3000,900000)`, id.repeat(32), who, JSON.stringify({ shape }));
  const before = await db.getAllAsync('SELECT * FROM running_sessions ORDER BY id');
  assert.equal((await repo.read()).badges[0].shape, 'heart');
  owner = B; assert.equal((await repo.read()).badges[0].shape, 'fish');
  owner = ''; assert.equal((await repo.read()).runs, 0);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM running_sessions ORDER BY id'), before);
});
