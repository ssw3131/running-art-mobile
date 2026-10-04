import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSharedRun, validateSharedRun, shareBase, shareUrl } from '../src/modules/run-sharing/model.ts';
import { createRunSharing } from '../src/modules/run-sharing/service.ts';
import { createRunShareRemote } from '../src/modules/run-sharing/remote.ts';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';

const id='a'.repeat(32), token='b'.repeat(64), owner='11111111-1111-4111-8111-111111111111';
const run={id,status:'completed',pointCount:4,distanceM:123,activeMs:65000};
const points=[
  {sequence:1,segment:0,timestamp:1000,longitude:127,latitude:37,accuracy:5},
  {sequence:2,segment:0,timestamp:2000,longitude:127.0001,latitude:37,accuracy:5},
  {sequence:3,segment:1,timestamp:4000,longitude:128,latitude:36,accuracy:5},
  {sequence:4,segment:1,timestamp:5000,longitude:128.0001,latitude:36,accuracy:5},
];
const course={id:'c'.repeat(32),name:'처음 하트',snapshot:{route:[[127,37],[127.001,37.001],[127,37]],target:[[127,37],[127.002,37.002],[127,37]]}};
test('actual path preserves segment gaps and omits identity, timestamps, raw record fields',()=>{
  const data=makeSharedRun({...run,email:'private@example.invalid',startedAt:1},points);
  assert.deepEqual(data.segments,[[[127,37],[127.0001,37]],[[128,36],[128.0001,36]]]);
  assert.equal(data.planned,null);
  assert.deepEqual(Object.keys(data).sort(),['activeMs','distanceM','planned','schemaVersion','segments','title']);
  assert.ok(!JSON.stringify(data).includes('accuracy'));
  assert.ok(!JSON.stringify(data).includes('timestamp'));
});
test('all three overlays come from actual points and the start-time course snapshot',()=>{
  const data=makeSharedRun({...run,courseId:course.id,courseName:course.name},points,course);
  assert.deepEqual(data.planned,{route:course.snapshot.route,target:course.snapshot.target});
  assert.notDeepEqual(data.segments[0],data.planned.route);
  data.planned.route[0][0]=0; assert.equal(course.snapshot.route[0][0],127);
  assert.throws(()=>makeSharedRun({...run,courseId:course.id},points),/코스 정보/);
});
test('rejects invalid, empty, noncompleted, oversized, out-of-order and extra-field snapshots',()=>{
  assert.throws(()=>makeSharedRun({...run,status:'running'},points));
  assert.throws(()=>makeSharedRun({...run,pointCount:3},points));
  assert.throws(()=>makeSharedRun(run,[points[1],points[0],...points.slice(2)]));
  assert.throws(()=>makeSharedRun(run,points.map(p=>({...p,longitude:181}))));
  const snapshot=makeSharedRun(run,points);
  for(const patch of [{accountId:owner},{segments:[]},{segments:[[[127,37]]]},{segments:[[[NaN,37],[127,37]]]},{planned:{route:[[0,0]],target:[[0,0],[1,1]]}},{activeMs:-1},{distanceM:Infinity}]) {
    assert.throws(()=>validateSharedRun({...snapshot,...patch}));
  }
});
test('opaque fragment links do not embed owner, local id, GPX file or map provider',()=>{
  assert.equal(shareUrl('https://share.example/',token),`https://share.example/#r/${token}`);
  for(const base of ['http://unsafe.example','https://a:b@example','https://example/?token=oops','https://example/#bad']) assert.equal(shareBase(base),null);
  assert.throws(()=>shareUrl('https://share.example/','short'));
});
test('actual SQLite finished run retains pause gaps and remains private to its account',async t=>{
  const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);
  let now=1800000000000,currentOwner=owner;
  const repo=createRunRepository(db,()=>now,()=>currentOwner);
  const started=await repo.start();
  const append=async lng=>{await repo.append([{timestamp:now,latitude:37,longitude:lng,accuracy:5}]);now+=5000;};
  await append(127);await append(127.0001);await repo.transition(started.id,'paused');now+=10000;
  await repo.transition(started.id,'running');await append(127.01);await append(127.0101);
  await repo.transition(started.id,'completed');
  const saved=await repo.get(started.id), path=await repo.points(started.id);
  assert.equal(makeSharedRun(saved,path).segments.length,2);
  currentOwner='22222222-2222-4222-8222-222222222222';
  await assert.rejects(repo.get(started.id));assert.deepEqual(await repo.list(),[]);
});
test('sharing confirms sync before publishing and blocks stale account results',async()=>{
  let account=owner,uploaded=0;const calls=[];
  const deps={base:'https://share.example/',owner:()=>account,load:async()=>({run,points,course:null}),sync:async()=>{calls.push('sync');},
    exclusive:async fn=>fn(),remote:async()=>({current:async()=>token,revoke:async()=>{calls.push('revoke');},publish:async()=>{uploaded++;calls.push('publish');return token;}})};
  const service=createRunSharing(deps);
  assert.equal(await service.publish(id,owner),`https://share.example/#r/${token}`);
  assert.deepEqual(calls,['sync','publish']);
  const changed=createRunSharing({...deps,sync:async()=>{account='other';}});
  await assert.rejects(changed.publish(id,owner),/계정/);assert.equal(uploaded,1);
  await assert.rejects(service.revoke(id,owner),/계정/);
  account=owner;
  const unavailable=createRunSharing({...deps,sync:async()=>{throw new Error('offline');}});
  await assert.rejects(unavailable.publish(id,owner));assert.equal(uploaded,1);
});
test('RPC credential is frozen; publish response and failures never fabricate links',async()=>{
  const calls=[];let response=Response.json({token});
  const remote=createRunShareRemote({url:'https://test.supabase.co',key:'sb_publishable_public',token:'fixed-owner-token',fetch:async(url,init)=>{calls.push({url,init});return response;}});
  assert.equal(await remote.publish(id,makeSharedRun(run,points)),token);
  assert.equal(calls[0].init.headers.Authorization,'Bearer fixed-owner-token');
  assert.equal(calls[0].init.redirect,'error');
  const body=JSON.parse(calls[0].init.body);assert.equal(body.p_run_id,id);assert.equal(body.p_snapshot.planned,null);
  response=Response.json({token:'invalid'});await assert.rejects(remote.current(id));
  response=new Response('',{status:403});await assert.rejects(remote.publish(id,makeSharedRun(run,points)),/로그인/);
  response=Response.json({token:null});assert.equal(await remote.current(id),null);
  response=new Response(null,{status:204});await remote.revoke(id);
});
