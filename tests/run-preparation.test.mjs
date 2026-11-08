import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { createRunController } from '../src/modules/running/controller.ts';
import { offset } from '../src/modules/guidance/geometry.ts';

async function fixture(t) {
  const db = openSqlite(); t.after(() => db.closeAsync()); await migrateDatabase(db);
  const route = [[0,0],[200,0],[200,200],[0,200],[0,0]].map(([x,y]) => offset([127,37], x,y));
  const snapshot = { schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:3,lengthKm:0.8,score:80,route,target:route };
  const repo = createRunRepository(db), courses = createCourseRepository(db);
  const course = await courses.save(snapshot, '준비 회귀');
  const outside = offset(route[0], -60, 0);
  const fix = (position = outside) => ({ timestamp:Date.now(), latitude:position[1], longitude:position[0], accuracy:5 });
  const plan = {path:[outside,route[0]],targetM:0,distanceM:60};
  const calls = {locate:0,plan:0,start:0}, progress = [];
  const driver = {prepare:async()=>{},locate:async()=>{calls.locate++;return fix();},start:async()=>{calls.start++;},stop:async()=>{},healthy:async()=>true};
  const planner = async request => {calls.plan++;return {...plan,path:[request.position,route[0]]};};
  const controller = createRunController(async()=>repo,driver,planner);
  return {repo,course,route,outside,fix,plan,calls,driver,controller,progress};
}

test('fresh prepared GPS and approach start without a second GPS watch or routing request', async t => {
  const f = await fixture(t);
  const run = await f.controller.start(f.course.id, {courseId:f.course.id,read:()=>({fix:f.fix(),plan:f.plan})}, value=>f.progress.push(value));
  assert.equal(run.status,'running');
  assert.deepEqual(f.calls,{locate:0,plan:0,start:1});
  assert.equal((await f.repo.guidance(run.id)).state.phase,'approach');
  assert.match(f.progress.at(-1),/기록/);
});

test('permission time uses the latest preview fix, not the fix captured when pressing start', async t => {
  const f = await fixture(t);
  let current = {...f.fix(),timestamp:Date.now()-60000};
  f.driver.prepare = async()=>{current=f.fix(f.route[0]);};
  const run = await f.controller.start(f.course.id,{courseId:f.course.id,read:()=>({fix:current,plan:f.plan})});
  assert.equal(run.status,'running');
  assert.deepEqual(f.calls,{locate:0,plan:0,start:1});
});

test('stale preview needs one fresh fix but keeps a still-valid approach', async t => {
  const f = await fixture(t);
  await f.controller.start(f.course.id,{courseId:f.course.id,read:()=>({fix:{...f.fix(),timestamp:Date.now()-60000},plan:f.plan})});
  assert.deepEqual(f.calls,{locate:1,plan:0,start:1});
});

test('a plan for an old position is rebuilt once and a fresh fix is reused after quick routing', async t => {
  const f = await fixture(t), moved=offset(f.outside,-80,0);
  await f.controller.start(f.course.id,{courseId:f.course.id,read:()=>({fix:f.fix(moved),plan:f.plan})});
  assert.deepEqual(f.calls,{locate:0,plan:1,start:1});
});

test('a preview for another course is never trusted', async t => {
  const f = await fixture(t);
  await f.controller.start(f.course.id,{courseId:'another-course',read:()=>{throw Error('must not read');}});
  assert.deepEqual(f.calls,{locate:1,plan:1,start:1});
});

test('cancelling the initial GPS wait releases it without a session or native start', async t => {
  const f = await fixture(t);
  let signal;
  f.driver.locate = async value => { signal=value;return new Promise((resolve,reject)=>value.addEventListener('abort',()=>reject(Error('러닝 준비를 취소했어요.')),{once:true})); };
  const starting=f.controller.start(f.course.id);
  while(!signal) await setImmediate();
  f.controller.cancelPreparation();
  await assert.rejects(starting,/취소/);
  assert.equal(signal.aborted,true);assert.equal(await f.repo.active(),null);assert.equal(f.calls.start,0);
});

test('poor accuracy and stale GPS cannot create a session even if a driver returns them', async t => {
  const f=await fixture(t);
  for(const change of [{accuracy:50},{accuracy:null},{timestamp:Date.now()-6000}]) {
    f.driver.locate=async()=>({...f.fix(),...change});
    await assert.rejects(f.controller.start(f.course.id),/최신 위치/);
    assert.equal(await f.repo.active(),null);
  }
  assert.equal(f.calls.start,0);
});
