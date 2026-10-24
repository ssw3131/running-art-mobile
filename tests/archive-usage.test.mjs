import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { openSqlite } from './helpers/sqlite.mjs';
import { createStorageClient } from '../src/modules/storage/client.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { courseContinuation } from '../src/modules/courses/continuation.ts';
import { encodeSnapshot } from '../src/modules/courses/model.ts';
import { meteredGeneration } from '../src/modules/usage/generation.ts';
import { createComputeServer } from '../server/route-compute/server.mjs';
import { identityHashes } from '../supabase/functions/_shared/usage-backend.ts';
import { createUsageHandler } from '../supabase/functions/usage/handler.ts';
import { usageFixture, usageHeaders } from './helpers/usage.mjs';
import { request, response } from './helpers/compute-contract.mjs';
const ownerA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ownerB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const snapshot={schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:3,lengthKm:3,score:80,route:[[127,37],[127,37.001],[127.001,37.001],[127,37]],target:[[127,37],[127,37.001],[127.001,37.001],[127,37]]};
function saveBackend() {
  let used=0,online=true,lose=false;
  const ops=new Map(),courses=new Map();
  return { uuid:randomUUID, get used(){return used;}, set online(value){online=value;}, set lose(value){lose=value;},
    async command(action,args={}) {
      if(!online)throw Error('offline');
      let op=ops.get(args.id);
      if(action==='read')return op?structuredClone(op):null;
      if(action==='reserve') {
        if(!op){op={state:'reserved',fingerprint:args.fingerprint};ops.set(args.id,op);}
        const existing=courses.get(args.fingerprint);if(existing)return {state:'existing',courseId:existing};
      }
      if(action==='commit'&&op.state==='reserved'){used++;op.state='committed';op.courseId=args.courseId;courses.set(op.fingerprint,args.courseId);if(lose){lose=false;throw Error('response lost');}}
      if(action==='delete_course'){for(const [hash,id] of courses)if(id===args.courseId)courses.delete(hash);return {state:'deleted'};}
      return structuredClone(op);
    },
  };
}
test('save staging: local failure charges nothing; lost commit and restart expose exactly one course; delete/resave consumes again',async t=>{
  let failStage=true,owner=ownerA;
  const db=openSqlite(':memory:',{afterRun(sql){if(failStage&&sql.startsWith('INSERT INTO usage_pending'))throw Error('disk full');}});t.after(()=>db.closeAsync());
  const access=saveBackend(),storage=await createStorageClient(async()=>db,()=>owner,access)();
  await assert.rejects(storage.courses.save(snapshot,'처음'),/disk full/);assert.equal(access.used,0);assert.equal(await storage.courses.count(),0);
  failStage=false;access.lose=true;
  await assert.rejects(storage.courses.save(snapshot,'처음'),/response lost/);assert.equal(access.used,1);assert.equal(await storage.courses.count(),0);
  const restarted=await createStorageClient(async()=>db,()=>owner,access)();
  await restarted.courses.recover();assert.equal(access.used,1);assert.equal(await restarted.courses.count(),1);
  const first=(await restarted.courses.list())[0];access.online=false;
  assert.equal((await restarted.courses.save(snapshot,'중복')).id,first.id);await restarted.courses.rename(first.id,'수정');assert.equal(access.used,1);
  owner=ownerB;assert.equal(await restarted.courses.count(),0);owner=ownerA;
  await restarted.courses.remove(first.id);assert.equal(access.used,1);
  await assert.rejects(restarted.courses.save(snapshot,'재저장'),/offline/);
  access.online=true;await restarted.courses.save(snapshot,'재저장');assert.equal(access.used,2);assert.equal(await restarted.courses.count(),1);
});
test('archive latest attempt and completed-before-pagination preserve all other records and isolate owners',async t=>{
  const db=openSqlite();t.after(()=>db.closeAsync());const store=await createStorageClient(async()=>db,()=>ownerA)();
  const saved=await store.courses.save(snapshot,'하트'),hash=encodeSnapshot(snapshot).hash;
  assert.equal((await store.courses.list())[0].unfinished,false);
  const insert=async(status,outcome,at,courseId=saved.id,owner=ownerA,snapshotHash=hash)=>{
    const id=randomUUID().replaceAll('-','');
    await db.runAsync(`INSERT INTO running_sessions(id,status,started_at,ended_at,checkpoint_at,resumed_at,owner_id,course_id,course_name,course_snapshot_json,course_snapshot_hash,course_outcome)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,id,status,at,status==='completed'?at+1:null,at,at,owner,courseId,courseId?'하트':null,courseId?encodeSnapshot(snapshot).json:null,courseId?snapshotHash:null,outcome);return id;
  };
  const first=await insert('completed','finished',1);
  assert.equal((await store.courses.list())[0].unfinished,false);
  for(const [status,outcome] of [['running','active'],['paused','arrival-pending'],['interrupted','active'],['completed','stopped']]){
    const id=await insert(status,outcome,2);
    assert.equal((await store.courses.list())[0].unfinished,true);
    const last=await store.courses.latestAttempt(saved.id,hash);
    assert.equal(courseContinuation(last,status==='completed'?null:id).action,status==='completed'?'new-after-stop':'resume');
    assert.equal(courseContinuation(last,'unrelated').action,'other-active');
    assert.deepEqual((await store.runs.finished()).map(r=>r.id),[first]);
    await db.runAsync('DELETE FROM running_sessions WHERE id=?',id);
  }
  await insert('completed','stopped',3,'c'.repeat(32),ownerA,'f'.repeat(64)); // same shape, different course
  assert.equal((await store.courses.list())[0].unfinished,false);
  await insert('completed','stopped',4,'d'.repeat(32)); // immutable copy links a deleted/re-saved course
  assert.equal((await store.courses.list())[0].unfinished,true);
  await insert('completed','finished',5);
  assert.equal((await store.courses.list())[0].unfinished,false);
  for(let i=0;i<35;i++){await insert('completed',i%2?'finished':'stopped',10+i);await insert('completed',null,100+i,null);}
  const full=await store.runs.list(100),finished=await store.runs.finished(10),next=await store.runs.finished(10,10);
  assert.equal(finished.length,10);assert.equal(next.length,9);assert.equal(new Set([...finished,...next].map(r=>r.id)).size,19);
  assert.ok(full.length>finished.length+next.length);
  assert.equal((await createCourseRepository(db,Date.now,()=>ownerB).list()).length,0);
});
function journal(){let value=null;return {read:async()=>value,write:async(id,request_json,result_json)=>{value={id,request_json,result_json};},clear:async()=>{value=null;}};}
test('generation recovers a lost confirmation without recomputing; explicit cancellation before acceptance does not commit',async()=>{
  const fixture=usageFixture(),store=journal();let used=0,computes=0,lose=true;
  const access={uuid:randomUUID,command:async(action,args)=>{const old=fixture.operations.get(args.id)?.state;const value=await fixture.command('test-owner',action,args);if(action==='commit'&&old!=='committed'){used++;if(lose){lose=false;throw Error('response lost');}}return value;}};
  const remote=id=>async()=>{computes++;await fixture.command('test-owner','reserve',{id,fingerprint:'a'.repeat(64)});const value=response();await fixture.command('test-owner','ready',{id,result:value});return value;};
  const generate=meteredGeneration(remote,access,store),input={...request,elements:[]};
  await assert.rejects(generate(input,new AbortController().signal,false),/response lost/);
  assert.ok(await store.read());assert.equal(used,1);
  await generate(input,new AbortController().signal,false);assert.equal(used,1);assert.equal(computes,1);assert.ok((await store.read()).result_json);
  // Process death before the UI acknowledges still restores the same paid result.
  await generate(input,new AbortController().signal,false);assert.equal(used,1);assert.equal(computes,1);
  await store.clear((await store.read()).id);
  const controller=new AbortController();
  const cancelled=meteredGeneration(id=>async(...args)=>{const value=await remote(id)(...args);controller.abort();return value;},access,store);
  await assert.rejects(cancelled(input,controller.signal,false),e=>e.name==='CalculationCancelled');assert.equal(used,1);assert.equal(await store.read(),null);
});
test('HTTP authentication fails closed, retry returns ready result, and clients cannot manufacture successful calculations',async t=>{
  let computed=0;const usage=usageFixture(),server=createComputeServer({run:async()=>{computed++;return response();},close:async()=>{}},{usage});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
  const url=`http://127.0.0.1:${server.address().port}/v1/routes`,headers={'content-type':'application/json',...usageHeaders()},body=JSON.stringify(request);
  assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-operation-id':headers['x-operation-id']},body})).status,401);assert.equal(computed,0);
  for(let i=0;i<2;i++)assert.equal((await fetch(url,{method:'POST',headers,body})).status,200);assert.equal(computed,1);
  const handler=createUsageHandler(usage);
  for(const action of ['ready','bind_usage_subject'])assert.equal((await handler(new Request('http://isolated/usage',{method:'POST',headers,body:JSON.stringify({action})}))).status,400);
  assert.equal((await handler(new Request('http://isolated/usage',{method:'POST',headers,body:JSON.stringify({action:'reserve',id:randomUUID(),kind:'generation',fingerprint:'a'.repeat(64)})}))).status,400);
});
test('HMAC identity uses server-verified provider subject, never email or mutable internal user id',async()=>{
  const key='isolated-only-key-32-characters-long';
  const a=await identityHashes([{provider:'google',id:'old-internal',identity_data:{sub:'stable'}}],key);
  const b=await identityHashes([{provider:'google',id:'new-internal',identity_data:{sub:'stable'}},{provider:'email'}],key);
  assert.deepEqual(a,b);assert.match(a[0],/^[a-f0-9]{64}$/);assert.ok(!a[0].includes('stable'));
  assert.notDeepEqual(a,await identityHashes([{provider:'kakao',identity_data:{sub:'stable'}}],key));
  await assert.rejects(identityHashes([{provider:'google',id:'internal-only'}],key));
});
