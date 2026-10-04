// Explicit, disposable synthetic account only. Never use a user's session/GPS.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { migrateDatabase } from '../../src/modules/storage/migrations.ts';
import { createCourseRepository } from '../../src/modules/courses/repository.ts';
import { createRunRepository } from '../../src/modules/running/repository.ts';
import { createSyncRepository } from '../../src/modules/sync/repository.ts';
import { createSyncRemote } from '../../src/modules/sync/remote.ts';
import { synchronize } from '../../src/modules/sync/engine.ts';
import { createRunSharing } from '../../src/modules/run-sharing/service.ts';
import { createRunShareRemote } from '../../src/modules/run-sharing/remote.ts';
import { makeSharedRun } from '../../src/modules/run-sharing/model.ts';
import { createWithdrawalRemote } from '../../src/modules/account/withdrawal-remote.ts';

const mode=process.argv[2];
assert.ok(['init','publish','revoke','cleanup'].includes(mode));
const dir=new URL('../../.cache/run-sharing-hosted/',import.meta.url);
await mkdir(dir,{recursive:true});
const save=(name,data)=>writeFile(new URL(name,dir),JSON.stringify(data,null,2));
if(mode==='init') {
  const fixture={owner:randomUUID(),email:`runpen-share-qa-${Date.now()}@example.invalid`,password:randomBytes(32).toString('hex')};
  await writeFile(new URL('fixture.private.json',dir),JSON.stringify(fixture),{flag:'wx'});
  const sql=`begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
values('00000000-0000-0000-0000-000000000000','${fixture.owner}','authenticated','authenticated','${fixture.email}',extensions.crypt('${fixture.password}',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"공유 검증용 임시 계정"}',now(),now(),'','','','');
insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
values(gen_random_uuid(),'${fixture.owner}','${fixture.owner}',jsonb_build_object('sub','${fixture.owner}','email','${fixture.email}'),'email',now(),now(),now());
commit;
select 'synthetic fixture created' as result,(select count(*) from auth.users) as accounts,(select count(*) from public.personal_records) as records,(select count(*) from storage.objects) as files,(select count(*) from public.run_shares) as shares;`;
  await writeFile(new URL('seed.private.sql',dir),sql);
  console.log('Prepared isolated fixture and SQL in ignored cache; credentials not printed.');
  process.exit(0);
}
const fixture=JSON.parse(await readFile(new URL('fixture.private.json',dir),'utf8'));
assert.match(fixture.email,/^runpen-share-qa-\d+@example\.invalid$/);
const url=process.env.EXPO_PUBLIC_SUPABASE_URL,key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(new URL(url).hostname,'zymfblgzpidgfjjgrino.supabase.co');
const base='https://runpen-shared-runs.ssw3131.workers.dev';
const timedFetch=(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(45000)});
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:timedFetch}});
const {data,error}=await client.auth.signInWithPassword({email:fixture.email,password:fixture.password});
assert.equal(error,null);assert.equal(data.user.id,fixture.owner);
const owner=data.user.id,token=data.session.access_token;
const remote=createRunShareRemote({url,key,token,fetch:timedFetch});
const readLink=async link=>{
  const res=await timedFetch(url+'/rest/v1/rpc/read_run_share',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_token:link.split('#r/')[1]})});
  assert.equal(res.status,200);return res.json();
};
if(mode==='cleanup') {
  const withdrawal=createWithdrawalRemote({url,key,fetch:timedFetch,token:async()=>token});
  const receipt=await withdrawal.prepare(owner);
  assert.equal(await withdrawal.remove(owner,receipt.receipt),'deleted');
  assert.equal(await withdrawal.status(receipt.receipt),'deleted');
  assert.equal((await client.auth.signInWithPassword({email:fixture.email,password:fixture.password})).data.session,null);
  await save('cleanup.json',{at:new Date().toISOString(),deleted:true,scope:'only this disposable account and its synthetic data'});
  await unlink(new URL('fixture.private.json',dir));await unlink(new URL('seed.private.sql',dir));
  console.log('PASS: disposable fixture account and synthetic records removed via existing withdrawal API');
  process.exit(0);
}
if(mode==='revoke') {
  const result=JSON.parse(await readFile(new URL('published.json',dir),'utf8'));
  await remote.revoke(result.runId);assert.equal(await readLink(result.link),null);
  assert.equal(await remote.current(result.runId),null);
  await save('revoked.json',{at:new Date().toISOString(),revoked:true});
  console.log('PASS: owner revoked published link; anonymous lookup now null');
  process.exit(0);
}
const db=openSqlite(new URL('synthetic.sqlite',dir).pathname.replace(/^\/(\w:)/,'$1'));
try {
  await migrateDatabase(db);
  let now=Date.now()-3600000;
  const target=Array.from({length:241},(_,i)=>{const t=i/240*Math.PI*2;return [126.978+Math.pow(Math.sin(t),3)*.005,37.5665+(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))/16*.004];});
  const route=target.map(([x,y])=>[Math.round(x*4000)/4000,Math.round(y*4000)/4000]);
  const courseRepo=createCourseRepository(db,()=>now,()=>owner),runs=createRunRepository(db,()=>now,()=>owner);
  const course=await courseRepo.save({schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lng:126.978,lat:37.5665},targetKm:3,lengthKm:3,score:90,route,target},'합성 하트 · 배포 검증용');
  const fix=(i)=>({timestamp:now,longitude:route[i][0]+.000045*Math.sin(i),latitude:route[i][1]+.00004*Math.cos(i),accuracy:5});
  const run=await runs.start(course.id,fix(0));
  for(let i=0;i<route.length;i++){
    if(i===95){await runs.transition(run.id,'paused');now+=60000;await runs.transition(run.id,'running');i=104;}
    await runs.append([fix(i)]);now+=15000;
  }
  await runs.transition(run.id,'completed');
  const repo=createSyncRepository(db,()=>owner),syncRemote=createSyncRemote(client,owner);
  await repo.enable(owner,false);
  const service=createRunSharing({base,owner:()=>owner,exclusive:work=>work(),
    load:async id=>({run:await runs.get(id),points:await runs.points(id),course:(await runs.guidance(id))?.course??null}),
    sync:async()=>{await synchronize({owner,repository:repo,remote:syncRemote,check:()=>{}});const state=await repo.status(owner);assert.equal(state.pending,0);assert.equal(state.conflicts.length,0);},
    remote:async()=>remote});
  assert.equal(await service.current(run.id,owner),null);
  const link=await service.publish(run.id,owner);
  assert.equal(await service.current(run.id,owner),link);
  assert.equal(await service.publish(run.id,owner),link);
  const expected=makeSharedRun(await runs.get(run.id),await runs.points(run.id),(await runs.guidance(run.id)).course);
  assert.deepEqual(await readLink(link),expected);assert.ok(expected.segments.length>=2);
  assert.deepEqual(expected.planned,{route,target});
  await save('published.json',{at:new Date().toISOString(),runId:run.id,link,pointCount:expected.segments.reduce((n,s)=>n+s.length,0),segments:expected.segments.length,passed:true});
  console.log('PASS: real SQLite -> authenticated sync -> app sharing controller -> hosted anonymous snapshot, 3 geometries and pause gaps');
  console.log(link);
} finally {await db.closeAsync();}
