-- Transactional policy checks; synthetic accounts only, always rolled back.
-- Requires both migrations. Storage DELETE is deliberately never done in SQL.
begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','delete-a@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','delete-b@example.invalid');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
insert into storage.objects(bucket_id,name) values('personal-records',
 '11111111-1111-4111-8111-111111111111/course/'||repeat('a',32)||'/'||repeat('a',64)||'.json');
select public.commit_personal_record('course',repeat('a',32),0,repeat('1',32),false,
 jsonb_build_object('id',repeat('a',32),'name','fixture'),
 '11111111-1111-4111-8111-111111111111/course/'||repeat('a',32)||'/'||repeat('a',64)||'.json',repeat('a',64));
do $$ begin
 assert public.personal_account_active(),'active before deletion';
 assert (select count(*) from public.personal_records)=1,'owner can read before deletion';
 begin perform public.begin_account_deletion('22222222-2222-4222-8222-222222222222');
   raise exception 'client could start another account deletion';
 exception when insufficient_privilege then null; end;
 begin perform public.account_deletion_files('11111111-1111-4111-8111-111111111111');
   raise exception 'client could enumerate admin files';
 exception when insufficient_privilege then null; end;
 begin insert into public.account_deletions(owner_id) values('11111111-1111-4111-8111-111111111111');
   raise exception 'client could set deletion marker';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Add a second owner's independent file and marker-free account.
insert into storage.objects(bucket_id,name) values('personal-records',
 '22222222-2222-4222-8222-222222222222/run/'||repeat('b',32)||'/'||repeat('b',64)||'.json');
set local role service_role;
do $$ begin
 begin perform public.account_deletion_files('22222222-2222-4222-8222-222222222222');
   raise exception 'listing allowed without deletion marker';
 exception when insufficient_privilege then null; end;
end $$;
select public.begin_account_deletion('11111111-1111-4111-8111-111111111111');
select public.begin_account_deletion('11111111-1111-4111-8111-111111111111');
do $$ declare paths jsonb; begin
 assert (select count(*) from public.account_deletions)=1,'begin is idempotent';
 paths:=public.account_deletion_files('11111111-1111-4111-8111-111111111111');
 assert jsonb_array_length(paths)=1 and paths->>0 like '11111111-1111-4111-8111-111111111111/%','own files only';
end $$;
reset role;
set local role authenticated;
do $$ begin
 assert not public.personal_account_active(),'account gated';
 assert (select count(*) from public.personal_records)=0,'summaries hidden during deletion';
 assert (select count(*) from storage.objects where bucket_id='personal-records')=0,'files hidden during deletion';
 begin insert into storage.objects(bucket_id,name) values('personal-records',
   '11111111-1111-4111-8111-111111111111/run/'||repeat('c',32)||'/'||repeat('c',64)||'.json');
   raise exception 'upload accepted during deletion';
 exception when insufficient_privilege then null; end;
 begin perform public.commit_personal_record('course',repeat('a',32),0,repeat('1',32),false,
   jsonb_build_object('id',repeat('a',32),'name','fixture'),
   '11111111-1111-4111-8111-111111111111/course/'||repeat('a',32)||'/'||repeat('a',64)||'.json',repeat('a',64));
   raise exception 'idempotent commit bypassed deletion gate';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
do $$ begin
 assert public.personal_account_active(),'other account remains active';
 assert (select count(*) from storage.objects where bucket_id='personal-records')=1,'other account retains file';
end $$;
insert into storage.objects(bucket_id,name) values('personal-records',
 '22222222-2222-4222-8222-222222222222/course/'||repeat('d',32)||'/'||repeat('d',64)||'.json');
reset role;
-- Only a synthetic Auth row is removed to exercise FK/stale-JWT policies. This
-- does not simulate the real Storage/Auth APIs (their ordering is tested in JS).
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
do $$ begin
 assert not exists(select 1 from public.account_deletions where owner_id='11111111-1111-4111-8111-111111111111'),'marker cascaded';
 assert not exists(select 1 from public.personal_records where owner_id='11111111-1111-4111-8111-111111111111'),'summary cascaded';
 assert exists(select 1 from auth.users where id='22222222-2222-4222-8222-222222222222'),'other user preserved';
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$ begin
 assert not public.personal_account_active(),'old JWT is inactive after cascade';
 assert (select count(*) from storage.objects where bucket_id='personal-records')=0,'old JWT cannot see files';
 begin insert into storage.objects(bucket_id,name) values('personal-records',
   '11111111-1111-4111-8111-111111111111/run/'||repeat('e',32)||'/'||repeat('e',64)||'.json');
   raise exception 'old JWT could recreate files';
 exception when insufficient_privilege then null; end;
 begin perform public.commit_personal_record('course',repeat('a',32),0,repeat('1',32),true,null,null,null);
   raise exception 'old JWT could commit';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin perform public.begin_account_deletion('22222222-2222-4222-8222-222222222222');
   raise exception 'anonymous deletion allowed';
 exception when insufficient_privilege then null; end;
 begin perform public.personal_account_active(); raise exception 'anonymous guard RPC allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: live/deleting/deleted/other/anonymous identity, service-only RPCs, Storage RLS, commit retry gate, cascades' as account_deletion_verification;
rollback;
