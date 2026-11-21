import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('standalone inquiry repair works with partial S6 and does not touch published policies', async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);
   grant usage on schema public,auth to anon,authenticated,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function public.personal_account_active() returns boolean language sql stable security definer as $$select exists(select 1 from auth.users where id=auth.uid())$$;
   create table public.service_policies(id text primary key,body text);insert into public.service_policies values('existing','preserve published policy');`);
  const before=(await db.query('select * from public.service_policies')).rows;
  await db.exec(await readFile(new URL('../supabase/migrations/20261120234216_private_inquiry_board.sql',import.meta.url),'utf8'));
  assert.deepEqual((await db.query('select * from public.service_policies')).rows,before);
  assert.equal((await db.query("select to_regclass('public.service_notices') as notices")).rows[0].notices,null);
  const results=await db.exec(await readFile(new URL('../supabase/tests/inquiry_board.sql',import.meta.url),'utf8'));
  assert.match(results.flatMap(r=>r.rows).find(r=>r.inquiry_board_verification).inquiry_board_verification,/^PASS:/);
 } finally {await db.close();}
});
