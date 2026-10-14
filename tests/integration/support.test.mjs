import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createSupportRemote } from '../../src/modules/support/remote.ts';
const env=JSON.parse(readFileSync(process.env.QA_SUPABASE_STATUS??'.cache/qa-supabase-status.json','utf8'));
const url=new URL(env.API_URL);
assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.protocol==='http:','Only disposable local Supabase');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url.href,env.SERVICE_ROLE_KEY,options);
test('DB-SUPPORT-01: real concurrent inquiry receipt, public notices, isolation and deletion cascade',async t=>{
 const owners=[],clients=[],noticeId=`qa-support-${randomUUID()}`;
 t.after(async()=>{for(const client of clients)await client.auth.signOut();for(const id of owners)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);assert.equal((await admin.from('service_notices').delete().eq('id',noticeId)).error,null);});
 for(let i=0;i<2;i++){
  const email=`qa-support-${randomUUID()}@example.invalid`,password=randomUUID()+'Aa!9';
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(error,null);owners.push(data.user.id);
  const client=createClient(url.href,env.ANON_KEY,options);assert.equal((await client.auth.signInWithPassword({email,password})).error,null);clients.push(client);
 }
 const remote=createSupportRemote(clients[0]),request=randomUUID(),input={category:'기타',title:'QA 문의',body:'합성 자료만 사용',email:''};
 const receipts=await Promise.all([remote.submit(owners[0],request,input),remote.submit(owners[0],request,input)]);
 assert.deepEqual(receipts[0],receipts[1]);assert.deepEqual(await remote.submit(owners[0],request,input),receipts[0]);
 assert.equal((await clients[0].from('service_inquiries').select('*')).data.length,1);
 assert.equal((await clients[1].from('service_inquiries').select('*')).data.length,0);
 await assert.rejects(createSupportRemote(clients[1]).submit(owners[0],request,input));
 await assert.rejects(remote.submit(owners[0],request,{...input,title:'변경'}));
 const anonymous=createSupportRemote(createClient(url.href,env.ANON_KEY,options));
 await assert.rejects(anonymous.submit(owners[0],request,input));
 assert.equal((await admin.from('service_notices').insert({id:noticeId,title:'격리 시험',body:'실제 공지 아님',category:'시험',published:false})).error,null);
 assert.ok(!(await anonymous.notices()).some(n=>n.id===noticeId));
 assert.equal((await admin.from('service_notices').update({published:true}).eq('id',noticeId)).error,null);
 assert.ok((await anonymous.notices()).some(n=>n.id===noticeId));
 const owner=owners.shift();assert.equal((await admin.auth.admin.deleteUser(owner)).error,null);
 assert.equal((await admin.from('service_inquiries').select('*').eq('owner_id',owner)).data.length,0);
});
