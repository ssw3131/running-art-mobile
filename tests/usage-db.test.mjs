import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('isolated PostgreSQL usage: boundaries, idempotency, cancellation, deletion, policy, identity retention, permissions', { timeout: 60000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.account_deletions(owner_id uuid primary key);
    create table public.membership_policies(id text primary key,active boolean,published_at timestamptz);
    create table public.memberships(owner_id uuid,policy_id text,completed_at timestamptz);
    insert into public.membership_policies values('test',true,now());`);
  await db.exec(readFileSync('supabase/migrations/20261024120000_usage_allowances.sql','utf8'));
  const hash = n => n.toString(16).padStart(64,'0');
  const owner = randomUUID(), other = randomUUID();
  const create = async id => { await db.query('insert into auth.users values($1)',[id]); await db.query("insert into memberships values($1,'test',now())",[id]); };
  await create(owner); await create(other);
  const bind = async (id, identities) => (await db.query('select bind_usage_subject($1,$2) id',[id,identities])).rows[0].id;
  const subject = await bind(owner,[hash(1)]); await bind(other,[hash(2)]);
  const cmd = async (action, args={}, user=owner) => (await db.query('select usage_command($1,$2,$3,$4,$5,$6,$7) value',
    [user,action,args.id??null,args.kind??null,args.fingerprint??null,args.result??null,args.courseId??null])).rows[0].value;
  const result = {result:{candidates:[{valid:'synthetic-test'}]}};
  assert.equal(await cmd('read',{id:randomUUID()}),null);
  for (let i=0;i<5;i++) {
    const args={id:randomUUID(),kind:'generation',fingerprint:hash(100+i)};
    assert.equal((await cmd('reserve',args)).state,'reserved');
    await assert.rejects(cmd('read',args,other));
    assert.equal((await cmd('ready',{...args,result})).state,'ready');
    assert.equal((await cmd('commit',args)).state,'committed');
    assert.equal((await cmd('commit',args)).state,'committed');
    assert.equal((await cmd('cancel',args)).state,'committed');
    assert.deepEqual((await cmd('read',args)).result,result);
  }
  assert.equal((await cmd('reserve',{id:randomUUID(),kind:'generation',fingerprint:hash(200)})).state,'exhausted');
  assert.equal((await cmd('status')).generation.used,5);
  const saves=[];
  for(let i=0;i<15;i++) {
    const id=randomUUID(), args={id,kind:'save',fingerprint:hash(300+i),courseId:id.replaceAll('-','')}; saves.push(args);
    assert.equal((await cmd('reserve',args)).state,'reserved');
    assert.equal((await cmd('commit',args)).courseId,args.courseId);
    assert.equal((await cmd('reserve',{...args,id:randomUUID()})).state,'existing');
    assert.equal((await cmd('commit',args)).state,'committed');
  }
  assert.equal((await cmd('status')).save.used,15);
  await cmd('delete_course',saves[0]);
  assert.equal((await cmd('status')).save.used,15);
  assert.equal((await cmd('reserve',{...saves[0],id:randomUUID()})).state,'exhausted');
  await db.exec('update usage_policy set save_limit=16,generation_limit=6');
  assert.equal((await cmd('status')).version,2);
  const cancelled={id:randomUUID(),kind:'generation',fingerprint:hash(600)};
  await cmd('reserve',cancelled); await cmd('cancel',cancelled);
  assert.equal((await cmd('ready',{...cancelled,result})).state,'cancelled');
  assert.equal((await cmd('commit',cancelled)).state,'cancelled');
  assert.equal((await cmd('status')).generation.used,5);
  const pending={...cancelled,id:randomUUID()}; await cmd('reserve',pending);
  await db.exec('update usage_policy set generation_limit=4');
  await cmd('ready',{...pending,result}); assert.equal((await cmd('commit',pending)).state,'exhausted');
  assert.equal((await cmd('status')).generation.available,false);
  assert.equal((await db.query('select count(*)::int n from usage_policy_history')).rows[0].n,3);
  await db.query('insert into account_deletions values($1)',[owner]);
  await assert.rejects(cmd('commit',pending));
  await db.query('delete from auth.users where id=$1',[owner]);
  assert.equal((await db.query('select count(*)::int n from usage_operations where owner_id=$1',[owner])).rows[0].n,0);
  const rejoined=randomUUID(); await create(rejoined);
  assert.equal(await bind(rejoined,[hash(1)]),subject);
  const retained=await cmd('status',{},rejoined); assert.equal(retained.generation.used,5); assert.equal(retained.save.used,15);
  assert.equal((await cmd('status',{},other)).save.used,0);
  assert.equal(await bind(rejoined,[hash(1),hash(2)]),subject);
  assert.equal((await cmd('status',{},other)).save.used,15);
  await db.exec('set role authenticated');
  await assert.rejects(db.exec('update usage_policy set save_limit=999'));
  await assert.rejects(db.exec('select * from usage_identities'));
  await assert.rejects(cmd('status',{},rejoined));
  await db.exec('reset role');
});
