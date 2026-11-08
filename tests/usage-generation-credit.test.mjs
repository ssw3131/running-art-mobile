import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('account credits preserve counters, isolate owners, enforce reserve/commit and block clients', { timeout: 60000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.account_deletions(owner_id uuid primary key);
    create table public.membership_policies(id text primary key,active boolean,published_at timestamptz);
    create table public.memberships(owner_id uuid,policy_id text,completed_at timestamptz);
    insert into public.membership_policies values('test',true,now());`);
  for (const name of ['20261024120000_usage_allowances.sql', '20261107020000_account_generation_credits.sql'])
    await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  const owner = randomUUID(), other = randomUUID();
  for (const [i,id] of [owner,other].entries()) {
    await db.query('insert into auth.users values($1)',[id]);
    await db.query("insert into memberships values($1,'test',now())",[id]);
    await db.query('select bind_usage_subject($1,$2)',[id,[(i+1).toString().padStart(64,'0')]]);
  }
  await db.exec('update usage_subjects set generation_used=5,save_used=2');
  const cmd = async (id,action,args={}) => (await db.query('select usage_command($1,$2,$3,$4,$5,$6) value',
    [id,action,args.id??null,args.kind??null,args.fingerprint??null,args.result??null])).rows[0].value;
  await db.query("insert into usage_generation_credits(owner_id,extra_generations,reason) values($1,2,'isolated test')",[owner]);
  assert.deepEqual((await cmd(owner,'status')).generation,{used:5,total:7,available:true});
  assert.deepEqual((await cmd(other,'status')).generation,{used:5,total:5,available:false});
  assert.deepEqual((await cmd(owner,'status')).save,{used:2,total:15,available:true});
  assert.equal((await db.query('select generation_limit from usage_policy')).rows[0].generation_limit,5);
  const args = {id:randomUUID(),kind:'generation',fingerprint:'a'.repeat(64)};
  assert.equal((await cmd(other,'reserve',args)).state,'exhausted');
  assert.equal((await cmd(owner,'reserve',args)).state,'reserved');
  await cmd(owner,'ready',{...args,result:{result:{candidates:[{synthetic:true}]}}});
  assert.equal((await cmd(owner,'commit',args)).state,'committed');
  await cmd(owner,'commit',args);
  assert.equal((await cmd(owner,'status')).generation.used,6);
  const pending={...args,id:randomUUID()};
  await cmd(owner,'reserve',pending);
  assert.equal((await cmd(owner,'reserve',{...args,id:randomUUID()})).state,'exhausted');
  await cmd(owner,'cancel',pending);
  const final={...args,id:randomUUID()};
  await cmd(owner,'reserve',final);
  await cmd(owner,'ready',{...final,result:{result:{candidates:[{synthetic:true}]}}});
  await cmd(owner,'commit',final);
  assert.deepEqual((await cmd(owner,'status')).generation,{used:7,total:7,available:false});
  // Removing credits changes capacity without rewriting any committed operations or usage.
  await db.query('delete from usage_generation_credits where owner_id=$1',[owner]);
  assert.deepEqual((await cmd(owner,'status')).generation,{used:7,total:5,available:false});
  for (const role of ['anon','authenticated','service_role']) {
    await db.exec('set role '+role);
    await assert.rejects(db.query('select * from usage_generation_credits'));
    await assert.rejects(db.query("insert into usage_generation_credits values($1,100,'forged',now())",[owner]));
    await db.exec('reset role');
  }
});
