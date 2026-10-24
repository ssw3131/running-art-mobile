// Multi-session verification against this task's disposable native PostgreSQL.
// No hosted URLs, inherited PG credentials or arbitrary database targets accepted.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve('.cache/postgresql'),psql=path.join(root,'pgsql/bin/psql.exe');
assert.ok(existsSync(path.join(root,'data/PG_VERSION')));
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const env={...process.env,PGHOST:'127.0.0.1',PGPORT:'55439',PGUSER:'archiveqa',PGDATABASE:'postgres',PGPASSFILE:path.join(root,'pgpass.conf'),PGPASSWORD:'',PGSERVICE:'',PGOPTIONS:'',PGSSLMODE:'disable'};
delete env.PGSERVICE; delete env.PGPASSWORD;
const sql=text=>new Promise((resolve,reject)=>{
 const child=spawn(psql,['-X','-At','-v','ON_ERROR_STOP=1'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';
 child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);
 child.on('close',code=>code?reject(Error(err)):resolve(out.trim()));child.stdin.end(text);
});
const owner=randomUUID(),other=randomUUID(),hash=n=>n.toString(16).padStart(64,'0');
const cmd=(action,args={},actor=owner)=>`select usage_command(${q(actor)},${q(action)},${args.id?q(args.id):'null'},${args.kind?q(args.kind):'null'},${args.fingerprint?q(args.fingerprint):'null'},${args.result?q(JSON.stringify(args.result))+'::jsonb':'null'},${args.courseId?q(args.courseId):'null'});`;
const command=async(...args)=>JSON.parse(await sql(cmd(...args)));
const report={startedAt:new Date().toISOString(),backend:'native PostgreSQL 17; independent TCP sessions; synthetic Auth schema',checks:[]};
try {
 await sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key);create table account_deletions(owner_id uuid primary key);
 create table membership_policies(id text primary key,active boolean,published_at timestamptz);
 create table memberships(owner_id uuid,policy_id text,completed_at timestamptz);
 insert into membership_policies values('test',true,now());`);
 await sql(readFileSync('supabase/migrations/20261024120000_usage_allowances.sql','utf8'));
 for(const [id,h] of [[owner,hash(1)],[other,hash(2)]])await sql(`insert into auth.users values(${q(id)});insert into memberships values(${q(id)},'test',now());select bind_usage_subject(${q(id)},array[${q(h)}]);`);
 const attempts=Array.from({length:40},(_,i)=>({id:randomUUID(),kind:'generation',fingerprint:hash(100+i)}));
 const reserved=await Promise.all(attempts.map(args=>command('reserve',args)));
 assert.equal(reserved.filter(op=>op.state==='reserved').length,5);assert.equal(reserved.filter(op=>op.state==='exhausted').length,35);
 const winners=attempts.filter((_,i)=>reserved[i].state==='reserved');
 await Promise.all(winners.map(args=>command('ready',{...args,result:{result:{candidates:[{fixture:true}]}}})));
 await Promise.all(winners.flatMap(args=>Array.from({length:3},()=>command('commit',args))));
 assert.equal((await command('status')).generation.used,5);report.checks.push('40 concurrent reservations: 5 granted; 15 concurrent commits: exactly 5 uses');
 const saves=Array.from({length:30},(_,i)=>{const id=randomUUID();return {id,kind:'save',fingerprint:hash(200+i),courseId:id.replaceAll('-','')};});
 const saveOps=await Promise.all(saves.map(args=>command('reserve',args)));
 assert.equal(saveOps.filter(op=>op.state==='reserved').length,15);
 await Promise.all(saves.filter((_,i)=>saveOps[i].state==='reserved').map(args=>command('commit',args)));
 assert.equal((await command('status')).save.used,15);report.checks.push('30 simultaneous save requests: exactly 15 committed saves');
 await sql('update usage_policy set generation_limit=50,save_limit=50;');
 for(let i=0;i<12;i++){
  const args={id:randomUUID(),kind:'generation',fingerprint:hash(500+i)};await command('reserve',args);await command('ready',{...args,result:{result:{candidates:[{}]}}});
  const before=(await command('status')).generation.used;
  const results=await Promise.all([command('commit',args),command('cancel',args)]);
  assert.equal(results[0].state,results[1].state);
  assert.equal((await command('status')).generation.used,before+(results[0].state==='committed'?1:0));
 }
 report.checks.push('12 commit/cancel races converge to first terminal state with correct count');
 const duplicates=Array.from({length:8},()=>{const id=randomUUID();return {id,kind:'save',fingerprint:hash(900),courseId:id.replaceAll('-','')};});
 await Promise.all(duplicates.map(args=>command('reserve',args)));
 const before=(await command('status')).save.used;
 const committed=await Promise.all(duplicates.map(args=>command('commit',args)));
 assert.equal(new Set(committed.map(op=>op.courseId)).size,1);assert.equal((await command('status')).save.used,before+1);
 const recovered=await Promise.all(duplicates.map(args=>command('read',args)));assert.equal(new Set(recovered.map(op=>op.courseId)).size,1);
 report.checks.push('8 same-route commits from independent sessions resolve to one course and one use; response-loss reads retain canonical course ID');
 const beforeAll=await command('status');await sql('update usage_policy set generation_limit=0,save_limit=0;');
 assert.equal((await command('status')).save.used,beforeAll.save.used);
 assert.equal((await command('reserve',{id:randomUUID(),kind:'save',fingerprint:hash(901)})).state,'exhausted');
 await assert.rejects(command('read',duplicates[0],other));report.checks.push('policy downgrade preserves counts and blocks new work; cross-owner operation access denied');
 report.status='passed';
} catch(error){report.status='failed';report.error=error.message;throw error;}
finally {report.finishedAt=new Date().toISOString();writeFileSync('test-results/archive/postgres-concurrency.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks}));}
