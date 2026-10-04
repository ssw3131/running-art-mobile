import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const moduleUrl=process.env.RUN_SHARE_PGLITE_MODULE ? pathToFileURL(process.env.RUN_SHARE_PGLITE_MODULE).href : new URL('../../.cache/account-server-qa/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url).href;
const {PGlite}=await import(moduleUrl);
const db=new PGlite();
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema storage;grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;`);
  for(const file of ['20261003023000_personal_records.sql','20261003111300_account_deletion.sql','20261004074000_run_shares.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  }
  const results=await db.exec(await readFile(new URL('../../supabase/tests/run_shares.sql',import.meta.url),'utf8'));
  const report=results.flatMap(r=>r.rows).find(r=>r.run_sharing_verification)?.run_sharing_verification;
  assert.ok(report?.startsWith('PASS:'));assert.equal((await db.query('select count(*)::int as count from auth.users')).rows[0].count,0);
  console.log(report);console.log('PASS: test fixtures rolled back; no hosted service or real GPS records contacted');
}finally{await db.close();}
