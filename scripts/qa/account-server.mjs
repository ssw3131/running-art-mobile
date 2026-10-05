// Local PostgreSQL/WASM policy verification. This never contacts hosted Supabase.
// Install the optional runner into the ignored cache as documented in account-mypage.md.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../.cache/account-server-qa/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
try {
  // Minimal Supabase schema contract. Real Auth, Storage API/bytes and multi-session
  // advisory-lock interleavings remain hosted/disposable-account integration work.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb,updated_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  `);
  for (const migration of ['20261003023000_personal_records.sql', '20261003111300_account_deletion.sql', '20261005040000_profile_photos.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  const results = await db.exec(await readFile(new URL('../../supabase/tests/account_deletion.sql', import.meta.url), 'utf8'));
  const report = results.flatMap(r => r.rows).find(r => r.account_deletion_verification)?.account_deletion_verification;
  assert.ok(report?.startsWith('PASS:'));
  assert.equal((await db.query('select count(*)::int as count from auth.users')).rows[0].count, 0, 'fixtures rolled back');
  console.log(report);
  const photoResults = await db.exec(await readFile(new URL('../../supabase/tests/profile_photos.sql', import.meta.url), 'utf8'));
  const photoReport = photoResults.flatMap(r => r.rows).find(r => r.profile_photo_verification)?.profile_photo_verification;
  assert.ok(photoReport?.startsWith('PASS:'));
  assert.equal((await db.query('select count(*)::int as count from auth.users')).rows[0].count, 0, 'photo fixtures rolled back');
  console.log(photoReport);
  console.log('PASS: synthetic fixtures rolled back; no hosted connection');
} finally { await db.close(); }
