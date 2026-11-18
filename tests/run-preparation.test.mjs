import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { createRunController } from '../src/modules/running/controller.ts';
import { offset } from '../src/modules/guidance/geometry.ts';
import { elapsedMs } from '../src/modules/running/model.ts';

async function fixture(t) {
  const db = openSqlite(); t.after(() => db.closeAsync()); await migrateDatabase(db);
  let now=Date.now();
  const route = [[0,0],[200,0],[200,200],[0,200],[0,0]].map(([x,y]) => offset([127,37], x,y));
  const snapshot = { schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:3,lengthKm:0.8,score:80,route,target:route };
  const repo = createRunRepository(db,()=>now), courses = createCourseRepository(db,()=>now);
  const course = await courses.save(snapshot, '준비 회귀');
  const outside = offset(route[0], -60, 0);
  const fix = (position = outside) => ({ timestamp:now, latitude:position[1], longitude:position[0], accuracy:5 });
  const calls = {locate:0,plan:0,start:0}, progress = [];
  const driver = {prepare:async()=>{},locate:async()=>{calls.locate++;return fix();},start:async()=>{calls.start++;},stop:async()=>{},healthy:async()=>true};
  const planner = async () => {calls.plan++;throw Error('도로 자료 없음 · offline');};
  const controller = createRunController(async()=>repo,driver,planner);
  return {db,repo,course,route,outside,fix,calls,driver,controller,progress,now:()=>now,advance:()=>{now+=1000;}};
}

test('fresh GPS outside the course starts offline without a road query or another GPS watch', async t => {
  const f = await fixture(t);
  const run = await f.controller.start(f.course.id, {courseId:f.course.id,read:()=>({fix:f.fix()})}, value=>f.progress.push(value));
  assert.equal(run.status,'running');
  assert.deepEqual(f.calls,{locate:0,plan:0,start:1});
  const guide=await f.repo.guidance(run.id);
  assert.equal(guide.state.phase,'approach');assert.deepEqual(guide.state.position,f.outside);
  assert.deepEqual(guide.state.returnPath,[]);assert.equal(guide.state.instruction,'코스에 합류하면 안내를 시작해요.');
  assert.ok(f.progress.every(value=>!value.includes('보행')));
  assert.match(f.progress.at(-1),/기록/);
});

test('permission time uses the latest preview fix, not the fix captured when pressing start', async t => {
  const f = await fixture(t);
  let current = {...f.fix(),timestamp:Date.now()-60000};
  f.driver.prepare = async()=>{current=f.fix(f.route[0]);};
  const run = await f.controller.start(f.course.id,{courseId:f.course.id,read:()=>({fix:current})});
  assert.equal(run.status,'running');
  assert.deepEqual(f.calls,{locate:0,plan:0,start:1});
});

test('stale preview gets one fresh GPS fix without calculating any path', async t => {
  const f = await fixture(t);
  await f.controller.start(f.course.id,{courseId:f.course.id,read:()=>({fix:{...f.fix(),timestamp:Date.now()-60000}})});
  assert.deepEqual(f.calls,{locate:1,plan:0,start:1});
});

test('a preview for another course is never trusted', async t => {
  const f = await fixture(t);
  await f.controller.start(f.course.id,{courseId:'another-course',read:()=>{throw Error('must not read');}});
  assert.deepEqual(f.calls,{locate:1,plan:0,start:1});
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

test('poor accuracy, future and stale GPS cannot create a session', async t => {
  const f=await fixture(t);
  for(const change of [{accuracy:50},{accuracy:null},{timestamp:Date.now()-6000},{timestamp:Date.now()+60000}]) {
    f.driver.locate=async()=>({...f.fix(),...change});
    await assert.rejects(f.controller.start(f.course.id),/최신 위치/);
    assert.equal(await f.repo.active(),null);
  }
  assert.deepEqual(f.calls,{locate:0,plan:0,start:0});
});

test('permission failure and GPS timeout leave no record or running service',async t=>{
  const f=await fixture(t);
  f.driver.prepare=async()=>{throw Error('위치 권한을 허용해 주세요.');};
  await assert.rejects(f.controller.start(f.course.id),/권한/);
  f.driver.prepare=async()=>{};
  f.driver.locate=async()=>{throw Error('15초 동안 정확한 출발 위치를 받지 못했어요.');};
  await assert.rejects(f.controller.start(f.course.id),/15초/);
  assert.equal(await f.repo.active(),null);assert.equal(f.calls.start,0);assert.equal(f.calls.plan,0);
});

test('concurrent starts create exactly one session without road work',async t=>{
  const f=await fixture(t);
  const results=await Promise.allSettled([f.controller.start(f.course.id),f.controller.start(f.course.id)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/진행 중인 러닝/);
  assert.equal((await f.db.getFirstAsync('SELECT count(*) AS n FROM running_sessions')).n,1);
  assert.equal(f.calls.start,1);assert.equal(f.calls.plan,0);
});

test('recording and monitoring never route before joining; approach counts as running but not lap progress',async t=>{
  const f=await fixture(t),run=await f.controller.start(f.course.id);
  const feed=async(x,y)=>{f.advance();await f.controller.ingest([f.fix(offset(f.route[0],x,y))]);await f.controller.monitor();};
  for(let x=-60;x<=-15;x+=5)await feed(x,0);
  const before=await f.repo.get(run.id),guide=await f.repo.guidance(run.id);
  assert.ok(before.distanceM>35);assert.equal(elapsedMs(before,f.now()),10000);
  assert.equal(guide.state.progressM,0);assert.equal(guide.state.phase,'approach');
  assert.ok((await f.repo.points(run.id)).length>2);assert.equal(f.calls.plan,0);
  await f.controller.retryNavigation();assert.equal(f.calls.plan,0);
  for(let x=-10;x<=0;x+=5)await feed(x,0);
  for(let i=0;i<4;i++)await feed(0,0);
  assert.equal((await f.repo.guidance(run.id)).state.phase,'direction');
  for(let x=5;x<=40;x+=5)await feed(x,0);
  const joined=await f.repo.guidance(run.id);
  assert.equal(joined.state.phase,'lap');assert.ok(joined.state.progressM>=35);assert.equal(f.calls.plan,0);
  assert.ok((await f.repo.get(run.id)).distanceM>joined.state.progressM+40);
});

test('restored approach routes and late planner results cannot restore initial navigation',async t=>{
  const f=await fixture(t),run=await f.controller.start(f.course.id);
  const original=(await f.repo.guidance(run.id)).checkpoint;
  const old={...original,navigation:{path:[f.outside,f.route[0]],targetM:0,distanceM:60},navigationError:'old error',navigationProgress:15};
  await f.db.runAsync('UPDATE running_sessions SET guidance_json=? WHERE id=?',JSON.stringify(old),run.id);
  const guide=await f.repo.guidance(run.id);
  assert.equal(guide.checkpoint.navigation,null);assert.equal(guide.state.navigationError,null);
  await f.repo.setNavigation(run.id,'approach:0:0',old.navigation,null);
  assert.deepEqual(JSON.parse((await f.db.getFirstAsync('SELECT guidance_json FROM running_sessions WHERE id=?',run.id)).guidance_json),old,'reading and rejecting a stale response never rewrites the saved record');
  await f.controller.pause(run.id);await f.controller.resume(run.id);
  assert.equal((await f.repo.guidance(run.id)).state.phase,'approach');
  f.advance();await f.controller.ingest([f.fix()]);assert.equal(f.calls.plan,0);
});
