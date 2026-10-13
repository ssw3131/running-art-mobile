import test from 'node:test';
import assert from 'node:assert/strict';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { prepareRunRetry } from '../src/modules/running/retry.ts';
import { groupRunsByMonth,runOutcomeLabel } from '../src/modules/running/archive.ts';
import { offset } from '../src/modules/guidance/geometry.ts';
const BASE=1800000000000;
const route=[[0,0],[0,240],[240,240],[240,0],[0,0]].map(([x,y])=>offset([127,37],x,y));
const snap={schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:3,lengthKm:3,score:80,route,target:route};
async function fixture(t){const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);let now=BASE;
 const courses=createCourseRepository(db,()=>now),runs=createRunRepository(db,()=>now);const course=await courses.save(snap,'러닝 당시 이름');
 const fix=()=>({timestamp:now,latitude:37,longitude:127,accuracy:5});
 return {db,courses,runs,course,fix,time:n=>now=BASE+n};}
test('retry after deleted course restores immutable snapshot, starts next day from zero and retains old result',async t=>{
 const f=await fixture(t),run=await f.runs.start(f.course.id,f.fix());
 f.time(30000);await f.runs.transition(run.id,'completed');const before=await f.runs.get(run.id),guide=await f.runs.guidance(run.id);
 await f.courses.rename(f.course.id,'변경한 이름');await f.courses.remove(f.course.id);assert.equal(await f.courses.count(),0);
 const saved=await prepareRunRetry(f,run.id,()=>{});assert.equal(saved.created,true);assert.equal(await f.courses.count(),1);
 assert.deepEqual((await f.courses.get(saved.id)).snapshot,snap);assert.equal((await f.courses.get(saved.id)).name,'러닝 당시 이름');
 const again=await prepareRunRetry(f,run.id,()=>{});assert.equal(again.id,saved.id);assert.equal(again.created,false);
 f.time(86400000);const next=await f.runs.start(saved.id,f.fix());assert.notEqual(next.id,run.id);assert.equal(next.distanceM,0);assert.equal(next.activeMs,0);assert.equal(next.courseOutcome,'active');
 assert.deepEqual(await f.runs.get(run.id),before);assert.deepEqual((await f.runs.guidance(run.id)).checkpoint,guide.checkpoint);
 assert.equal((await f.runs.guidance(next.id)).state.progressM,0);
 await assert.rejects(prepareRunRetry(f,run.id,()=>{}),/진행 중/);
});
test('retry cancellation or account change between awaits cannot save into the next account',async t=>{
 const f=await fixture(t),run=await f.runs.start(f.course.id,f.fix());await f.runs.transition(run.id,'completed');await f.courses.remove(f.course.id);
 let count=0;await assert.rejects(prepareRunRetry(f,run.id,()=>{if(++count===4)throw Error('changed');}),/changed/);assert.equal(await f.courses.count(),0);
 const free=await f.runs.start();await f.runs.transition(free.id,'completed');await assert.rejects(prepareRunRetry(f,free.id,()=>{}),/코스가 없는/);
});
test('archive month order, duplicates and unfinished/free outcomes remain truthful',()=>{
 const run=(id,date,rest={})=>({id,startedAt:new Date(date).getTime(),status:'completed',courseId:'x',courseOutcome:'stopped',...rest});
 const jan=run('a','2027-01-01T01:00:00'),dec=run('b','2026-12-31T23:00:00');
 const groups=groupRunsByMonth([dec,jan,jan]);assert.deepEqual(groups.map(g=>g.key),['2027-01','2026-12']);assert.equal(groups[0].runs.length,1);
 assert.equal(runOutcomeLabel(jan),'중도 종료');assert.equal(runOutcomeLabel({...jan,courseOutcome:'finished'}),'코스 완주');assert.equal(runOutcomeLabel({...jan,courseId:null}),'자유 러닝');assert.equal(runOutcomeLabel({...jan,status:'paused',courseOutcome:'arrival-pending'}),'이어달리기');
});
