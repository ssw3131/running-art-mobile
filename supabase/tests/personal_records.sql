-- Transactional integration checks. Synthetic users and metadata are rolled back.
begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','sync-a@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','sync-b@example.invalid');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
insert into storage.objects(bucket_id,name) values('personal-records',
 '11111111-1111-4111-8111-111111111111/course/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json');
do $$
declare r jsonb;
begin
 r:=public.commit_personal_record('course',repeat('a',32),0,repeat('1',32),false,
   jsonb_build_object('id',repeat('a',32),'name','synthetic fixture'),
   '11111111-1111-4111-8111-111111111111/course/'||repeat('a',32)||'/'||repeat('a',64)||'.json',repeat('a',64));
 assert r->>'outcome'='applied' and (r->'record'->>'version')::int=1,'initial commit';
 r:=public.commit_personal_record('course',repeat('a',32),0,repeat('1',32),false,
   jsonb_build_object('id',repeat('a',32),'name','synthetic fixture'),
   '11111111-1111-4111-8111-111111111111/course/'||repeat('a',32)||'/'||repeat('a',64)||'.json',repeat('a',64));
 assert r->>'outcome'='applied' and (r->'record'->>'version')::int=1,'retry is idempotent';
 r:=public.commit_personal_record('course',repeat('a',32),0,repeat('2',32),true,null,null,null);
 assert r->>'outcome'='conflict','stale delete conflict';
 assert (select count(*) from public.personal_records)=1,'owner select';
 begin
   update public.personal_records set owner_id='22222222-2222-4222-8222-222222222222';
   raise exception 'direct update was allowed';
 exception when insufficient_privilege then null; end;
 begin
   delete from public.personal_records;
   raise exception 'direct delete was allowed';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.personal_records(owner_id,kind,record_id,version,mutation_id,deleted)
   values('11111111-1111-4111-8111-111111111111','course',repeat('b',32),1,repeat('1',32),true);
   raise exception 'direct insert was allowed';
 exception when insufficient_privilege then null; end;
 begin
   perform public.commit_personal_record('course',repeat('b',32),0,repeat('1',32),false,
    jsonb_build_object('id',repeat('b',32),'name','missing'),
    '11111111-1111-4111-8111-111111111111/course/'||repeat('b',32)||'/'||repeat('b',64)||'.json',repeat('b',64));
   raise exception 'missing object was accepted';
 exception when invalid_parameter_value then null; end;
 -- Hosted Storage forbids SQL deletion independently of RLS; API deletion is tested on Android.
 begin delete from storage.objects where bucket_id='personal-records'; raise exception 'SQL storage delete allowed'; exception when insufficient_privilege then null; end;
 assert (select count(*) from storage.objects where bucket_id='personal-records')=1,'live file retained';
 update storage.objects set name='changed' where bucket_id='personal-records';
 assert (select count(*) from storage.objects where name='changed')=0,'immutable file';
end $$;
reset role;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
do $$
begin
 assert (select count(*) from public.personal_records)=0,'other account cannot read';
 assert (select count(*) from storage.objects where bucket_id='personal-records')=0,'other account cannot read files';
 begin
  insert into storage.objects(bucket_id,name) values('personal-records','11111111-1111-4111-8111-111111111111/course/'||repeat('c',32)||'/'||repeat('c',64)||'.json');
  raise exception 'cross account upload allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.commit_personal_record('course',repeat('a',32),0,repeat('2',32),false,
   jsonb_build_object('id',repeat('a',32),'name','other file'),
   '11111111-1111-4111-8111-111111111111/course/'||repeat('a',32)||'/'||repeat('a',64)||'.json',repeat('a',64));
  raise exception 'foreign path accepted';
 exception when invalid_parameter_value then null; end;
 begin delete from storage.objects where bucket_id='personal-records'; raise exception 'SQL storage delete allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$
declare r jsonb;
begin
 assert (select count(*) from storage.objects where bucket_id='personal-records')=1,'foreign delete had no effect';
 r:=public.commit_personal_record('course',repeat('a',32),1,repeat('3',32),true,null,null,null);
 assert (r->'record'->>'deleted')::boolean and (r->'record'->>'version')::int=2,'delete tombstone';
 assert r->'record'->'summary'='null'::jsonb,'delete clears summary';
 assert (select count(*) from storage.objects where bucket_id='personal-records')=1,'fixture metadata retained until rollback';
 r:=public.commit_personal_record('course',repeat('a',32),1,repeat('3',32),true,null,null,null);
 assert (r->'record'->>'version')::int=2,'delete retry idempotent';
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$
begin
 begin perform * from public.personal_records; raise exception 'anon read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.commit_personal_record('course',repeat('a',32),0,repeat('1',32),true,null,null,null); raise exception 'anon RPC allowed'; exception when insufficient_privilege then null; end;
 assert (select count(*) from storage.objects where bucket_id='personal-records')=0,'anonymous files hidden';
end $$;
reset role;
select 'PASS: owner/other/anon DB and Storage visibility/upload, immutable files, RPC validation, retry, conflict, tombstone; Storage API removal is a separate Android test' as personal_sync_verification;
rollback;
