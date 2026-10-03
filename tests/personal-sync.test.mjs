import test from 'node:test';
import assert from 'node:assert/strict';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase, migrations } from '../src/modules/storage/migrations.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { createSyncRepository } from '../src/modules/sync/repository.ts';
import { synchronize, resolveConflict } from '../src/modules/sync/engine.ts';
import { validateRemote, decodePayload, digest } from '../src/modules/sync/model.ts';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const snapshot=(n=0)=>({schemaVersion:1,engineVersion:'0.2',source:'synthetic',shape:'heart',origin:{lat:0,lng:0},targetKm:1,lengthKm:1,score:90,
  route:[[0,0],[0.001+n*0.0001,0]],target:[[0,0],[0.001,0]]});
async function device(t,initial=A) {
  const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);
  let owner=initial,at=1000000;
  const scope=()=>owner;
  const courses=createCourseRepository(db,()=>at,scope),runs=createRunRepository(db,()=>at,scope),sync=createSyncRepository(db,scope);
  return {db,courses,runs,sync,setOwner:value=>{owner=value;},owner:()=>owner,time:value=>{at=value;}};
}
function cloud() {
  const records=new Map(),files=new Map();
  const hooks={};let requests=0;
  function remote(owner) {
    const key=(kind,id)=>`${owner}/${kind}/${id}`;
    return {
      async upload(path,payload){requests++;assert.ok(path.startsWith(owner+'/'));await hooks.upload?.();if(!files.has(path)) files.set(path,payload);},
      async download(path){requests++;assert.ok(path.startsWith(owner+'/'));await hooks.download?.();if(!files.has(path))throw new Error('Missing file');return files.get(path);},
      async commit(item,path,hash){
        requests++;const k=key(item.kind,item.id),current=records.get(k);
        if(current?.mutation_id===item.mutationId)return {outcome:'applied',record:structuredClone(current)};
        if((current?.version??0)!==item.remoteVersion)return {outcome:'conflict',record:structuredClone(current)};
        if(!item.deleted)assert.ok(files.has(path));
        const row={owner_id:owner,kind:item.kind,record_id:item.id,version:(current?.version??0)+1,mutation_id:item.mutationId,deleted:item.deleted,
          summary:structuredClone(item.summary),payload_path:item.deleted?current?.payload_path??null:path,payload_hash:item.deleted?current?.payload_hash??null:hash};
        records.set(k,row);await hooks.afterCommit?.(item,row);return {outcome:'applied',record:structuredClone(row)};
      },
      async page(kind,after){requests++;return [...records.values()].filter(r=>r.owner_id===owner&&r.kind===kind&&r.record_id>after).sort((a,b)=>a.record_id.localeCompare(b.record_id)).slice(0,2).map(r=>structuredClone(r));},
      async remove(path){requests++;await hooks.remove?.();if(![...records.values()].some(r=>!r.deleted&&r.payload_path===path)) files.delete(path);},
    };
  }
  return {records,files,hooks,remote,requests:()=>requests};
}
async function sync(d,c,extra={}) {
  const owner=d.owner();
  return synchronize({owner,repository:d.sync,remote:c.remote(owner),check:()=>assert.equal(d.owner(),owner),now:()=>2000000,...extra});
}
async function completedRun(d) {
  const run=await d.runs.start();d.time(1010000);
  await d.runs.append([{timestamp:1000000,latitude:0,longitude:0,accuracy:4},{timestamp:1005000,latitude:0,longitude:0.0002,accuracy:4}]);
  await d.runs.transition(run.id,'completed');return run.id;
}

test('v3 migration preserves all original course, note and GPS values without claiming or uploading',async t=>{
  const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db,migrations.slice(0,3));
  await db.runAsync("INSERT INTO storage_test_notes(content,created_at,updated_at) VALUES('보존',1,1)");
  await db.runAsync("INSERT INTO saved_courses VALUES(?,'코스','synthetic','heart',1,1,90,?,?,1,1)",'a'.repeat(32),JSON.stringify(snapshot()),digest(JSON.stringify(snapshot())));
  await db.runAsync("INSERT INTO running_sessions(id,status,started_at,checkpoint_at,resumed_at) VALUES(?,'completed',1,1,1)",'b'.repeat(32));
  await db.runAsync('INSERT INTO running_points VALUES(?,1,0,1,0,0,4)','b'.repeat(32));
  const tables=['saved_courses','running_sessions','running_points','storage_test_notes'],before={};
  for(const table of tables)before[table]=await db.getAllAsync(`SELECT * FROM ${table}`);
  await migrateDatabase(db);await migrateDatabase(db);
  for(const table of tables){const after=await db.getAllAsync(`SELECT * FROM ${table}`);assert.deepEqual(after.map(row=>Object.fromEntries(Object.keys(before[table][0]).map(k=>[k,row[k]]))),before[table]);}
  assert.equal((await db.getFirstAsync('SELECT owner_id FROM saved_courses')).owner_id,'');
  assert.equal((await db.getFirstAsync('SELECT count(*) n FROM sync_accounts')).n,0);
});

test('login never claims guests; opt-in binds only guests and account CRUD is separated',async t=>{
  const d=await device(t,''),c=cloud();const guest=await d.courses.save(snapshot(),'기기 기록');await completedRun(d);
  d.setOwner(A);assert.equal((await d.courses.list()).length,0);assert.equal((await d.runs.list()).length,0);
  await assert.rejects(d.courses.get(guest.id));await assert.rejects(d.courses.rename(guest.id,'잘못된 변경'));
  await d.sync.enable(A,true);assert.equal((await d.courses.list()).length,1);assert.equal((await d.runs.list()).length,1);
  await sync(d,c);d.setOwner(B);
  assert.equal((await d.courses.list()).length,0);await assert.rejects(d.courses.remove(guest.id));
  const separate=await d.courses.save(snapshot(),'B 기록');assert.notEqual(separate.id,guest.id);
  d.setOwner('');assert.deepEqual(await d.courses.list(),[]);d.setOwner(A);assert.equal((await d.courses.get(guest.id)).name,'기기 기록');
});

test('completed course and GPS restore exactly into a second real SQLite database and remain idempotent',async t=>{
  const first=await device(t),second=await device(t),c=cloud();
  const course=await first.courses.save(snapshot(),'복원 코스'),runId=await completedRun(first);
  await first.sync.enable(A,false);await second.sync.enable(A,false);await sync(first,c);await sync(second,c);await sync(second,c);
  assert.deepEqual(await second.courses.get(course.id),await first.courses.get(course.id));
  assert.deepEqual(await second.runs.get(runId),await first.runs.get(runId));assert.deepEqual(await second.runs.points(runId),await first.runs.points(runId));
  assert.equal((await second.courses.list()).length,1);assert.equal((await second.runs.list()).length,1);assert.equal((await second.sync.status(A)).pending,0);
  assert.equal((await second.sync.status(A)).lastSuccess,2000000);
});

test('disabled sync and unfinished running never send records; claiming during a run is refused',async t=>{
  const d=await device(t),c=cloud();await d.courses.save(snapshot(),'코스');
  await assert.rejects(sync(d,c));assert.equal(c.requests(),0);
  await d.sync.enable(A,false);const run=await d.runs.start();await assert.rejects(d.sync.enable(A,true));
  await sync(d,c);assert.equal([...c.records.values()].filter(r=>r.kind==='run').length,0);
  await d.runs.transition(run.id,'completed');await sync(d,c);assert.equal([...c.records.values()].filter(r=>r.kind==='run').length,1);
});

test('offline failure and lost commit response preserve durable work and retry without duplicate version',async t=>{
  const d=await device(t),c=cloud();const saved=await d.courses.save(snapshot(),'유지');await d.sync.enable(A,false);
  c.hooks.upload=()=>{throw new Error('offline');};await assert.rejects(sync(d,c));assert.equal((await d.sync.status(A)).pending,1);
  delete c.hooks.upload;c.hooks.afterCommit=()=>{delete c.hooks.afterCommit;throw new Error('response lost');};
  await assert.rejects(sync(d,c));assert.equal((await d.sync.status(A)).pending,1);await sync(d,c);
  assert.equal(c.records.get(`${A}/course/${saved.id}`).version,1);assert.equal((await d.sync.status(A)).pending,0);
});

test('rename while upload is pending is sent as a new mutation and never falsely acknowledged',async t=>{
  const d=await device(t),c=cloud();const saved=await d.courses.save(snapshot(),'이전');await d.sync.enable(A,false);
  c.hooks.afterCommit=async()=>{delete c.hooks.afterCommit;await d.courses.rename(saved.id,'새 이름');};
  await sync(d,c);const row=c.records.get(`${A}/course/${saved.id}`);assert.equal(row.version,2);assert.equal(row.summary.name,'새 이름');
  assert.equal((await d.sync.status(A)).pending,0);
});

test('delete during upload carries forward the accepted version and removes private coordinates',async t=>{
  const d=await device(t),c=cloud();const saved=await d.courses.save(snapshot(),'삭제');await d.sync.enable(A,false);
  c.hooks.afterCommit=async()=>{delete c.hooks.afterCommit;await d.courses.remove(saved.id);};
  await sync(d,c);assert.equal(c.records.get(`${A}/course/${saved.id}`).deleted,true);assert.equal(c.files.size,0);
  assert.equal((await d.sync.status(A)).pending,0);assert.equal((await d.courses.list()).length,0);
});

test('delete retry survives file removal failure and tombstones prevent restoration on another device',async t=>{
  const d=await device(t),other=await device(t),c=cloud();const saved=await d.courses.save(snapshot(),'삭제');await d.sync.enable(A,false);await other.sync.enable(A,false);
  await sync(d,c);await sync(other,c);await d.courses.remove(saved.id);
  c.hooks.remove=()=>{throw new Error('offline');};await assert.rejects(sync(d,c));assert.equal((await d.sync.status(A)).pending,1);
  delete c.hooks.remove;await sync(d,c);await sync(other,c);assert.deepEqual(await other.courses.list(),[]);assert.equal(c.files.size,0);
});

test('concurrent edits are kept locally as a durable conflict until the user chooses local or remote',async t=>{
  const d=await device(t),other=await device(t),c=cloud();const saved=await d.courses.save(snapshot(),'처음');await d.sync.enable(A,false);await other.sync.enable(A,false);
  await sync(d,c);await sync(other,c);await d.courses.rename(saved.id,'서버 변경');await sync(d,c);await other.courses.rename(saved.id,'기기 변경');
  const result=await sync(other,c);assert.equal(result.conflicts,1);assert.equal((await other.courses.get(saved.id)).name,'기기 변경');
  let conflict=(await other.sync.status(A)).conflicts[0];await resolveConflict({owner:A,repository:other.sync,remote:c.remote(A),conflict,choice:'local',check:()=>{}});await sync(other,c);
  await sync(d,c);assert.equal((await d.courses.get(saved.id)).name,'기기 변경');
  await d.courses.rename(saved.id,'다시 서버');await sync(d,c);await other.courses.rename(saved.id,'다시 기기');await sync(other,c);
  conflict=(await other.sync.status(A)).conflicts[0];await resolveConflict({owner:A,repository:other.sync,remote:c.remote(A),conflict,choice:'remote',check:()=>{}});
  assert.equal((await other.courses.get(saved.id)).name,'다시 서버');assert.equal((await other.sync.status(A)).conflicts.length,0);
});

test('a local edit during download is retained as conflict rather than overwritten',async t=>{
  const d=await device(t),other=await device(t),c=cloud();const saved=await d.courses.save(snapshot(),'처음');await d.sync.enable(A,false);await other.sync.enable(A,false);
  await sync(d,c);await sync(other,c);await d.courses.rename(saved.id,'서버');await sync(d,c);
  c.hooks.download=async()=>{delete c.hooks.download;await other.courses.rename(saved.id,'다운로드 중 수정');};
  await sync(other,c);assert.equal((await other.courses.get(saved.id)).name,'다운로드 중 수정');assert.equal((await other.sync.status(A)).conflicts.length,1);
});

test('account change during upload cannot acknowledge or restore into the new account',async t=>{
  const d=await device(t),c=cloud();await d.courses.save(snapshot(),'A 자료');await d.sync.enable(A,false);
  c.hooks.upload=()=>{d.setOwner(B);};await assert.rejects(sync(d,c));assert.equal(c.records.size,0);assert.deepEqual(await d.courses.list(),[]);
  d.setOwner(A);assert.equal((await d.sync.status(A)).pending,1);await assert.rejects(d.sync.status(B));
});

test('hash, identity, owner, path, summary and GPS consistency are validated before atomic restore',async t=>{
  const d=await device(t),other=await device(t),c=cloud();await d.courses.save(snapshot(),'정상');await completedRun(d);await d.sync.enable(A,false);await other.sync.enable(A,false);await sync(d,c);
  const course=[...c.records.values()].find(r=>r.kind==='course'),run=[...c.records.values()].find(r=>r.kind==='run');
  for(const patch of [{owner_id:B},{payload_path:'other/file.json'},{version:0},{record_id:'invalid'}])assert.throws(()=>validateRemote({...course,...patch},A));
  const original=c.files.get(course.payload_path);c.files.set(course.payload_path,original+' ');await assert.rejects(sync(other,c));assert.deepEqual(await other.courses.list(),[]);
  c.files.set(course.payload_path,original);assert.throws(()=>decodePayload({...run,summary:{...run.summary,distanceM:999999}},c.files.get(run.payload_path)));
  await sync(other,c);assert.equal((await other.courses.list()).length,1);
});

test('keyset pages and several outbox batches restore all records exactly once',async t=>{
  const d=await device(t),other=await device(t),c=cloud();for(let i=0;i<7;i++)await d.courses.save(snapshot(i),`코스 ${i}`);
  await d.sync.enable(A,false);await other.sync.enable(A,false);await sync(d,c);await sync(other,c);assert.deepEqual(await other.courses.list(),await d.courses.list());
});

test('restoring an ID owned by another local account fails without changing either account',async t=>{
  const d=await device(t),other=await device(t,B),c=cloud();const saved=await d.courses.save(snapshot(),'A');await d.sync.enable(A,false);await sync(d,c);
  const local=await other.courses.save(snapshot(1),'B');await other.db.runAsync('UPDATE saved_courses SET id=? WHERE id=?',saved.id,local.id);
  other.setOwner(A);await other.sync.enable(A,false);await assert.rejects(sync(other,c));other.setOwner(B);assert.equal((await other.courses.get(saved.id)).name,'B');
});

test('session loss interrupts a hidden running record at its last checkpoint and permits same-account recovery',async t=>{
  const d=await device(t);const id=(await d.runs.start()).id;d.time(1005000);
  await d.runs.append([{timestamp:1000000,latitude:0,longitude:0,accuracy:4}]);const before=await d.runs.get(id);
  d.setOwner('');await d.sync.interruptOtherRuns('');assert.deepEqual(await d.runs.list(),[]);
  d.setOwner(A);const recovered=await d.runs.get(id);assert.equal(recovered.status,'interrupted');assert.equal(recovered.activeMs,before.activeMs);assert.equal(recovered.pointCount,before.pointCount);
  d.time(1999000);await d.runs.transition(id,'running');assert.equal((await d.runs.get(id)).activeMs,before.activeMs);
});
