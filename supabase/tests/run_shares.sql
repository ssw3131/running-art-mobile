begin;
insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','share-a@example.invalid'),('22222222-2222-4222-8222-222222222222','share-b@example.invalid');
insert into public.personal_records(owner_id,kind,record_id,version,mutation_id,summary,payload_path,payload_hash)
values('11111111-1111-4111-8111-111111111111','run',repeat('a',32),1,repeat('b',32),
 jsonb_build_object('id',repeat('a',32),'status','completed','distanceM',123,'activeMs',65000,'pointCount',4),
 '11111111-1111-4111-8111-111111111111/run/'||repeat('a',32)||'/'||repeat('c',64)||'.json',repeat('c',64));
select set_config('share.fixture','{"schemaVersion":1,"title":"테스트 하트","distanceM":123,"activeMs":65000,"segments":[[[127,37],[127.001,37]],[[127.01,37],[127.011,37]]],"planned":{"route":[[127,37],[127.001,37]],"target":[[127,37],[127.002,37.001]]}}',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$declare first text; again text;begin
 first:=public.publish_run_share(repeat('a',32),current_setting('share.fixture')::jsonb)->>'token';
 assert length(first)=64;
 again:=public.publish_run_share(repeat('a',32),current_setting('share.fixture')::jsonb)->>'token';
 assert first=again,'retry must reuse the link';
 perform set_config('share.token',first,true);
 assert public.get_run_share(repeat('a',32))->>'token'=first;
 begin perform public.publish_run_share(repeat('e',32),current_setting('share.fixture')::jsonb);raise exception 'unowned run shared';exception when invalid_parameter_value then null;end;
 begin perform public.publish_run_share(repeat('a',32),current_setting('share.fixture')::jsonb||'{"owner_id":"private"}'::jsonb);raise exception 'extra private field allowed';exception when invalid_parameter_value then null;end;
 begin perform public.publish_run_share(repeat('a',32),current_setting('share.fixture')::jsonb||'{"distanceM":999}'::jsonb);raise exception 'summary mismatch allowed';exception when invalid_parameter_value then null;end;
 begin perform public.publish_run_share(repeat('a',32),current_setting('share.fixture')::jsonb||'{"planned":{"route":[[999,0],[0,0]],"target":[[0,0],[1,1]]}}'::jsonb);raise exception 'invalid planned coordinates';exception when invalid_parameter_value then null;end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin
 assert public.get_run_share(repeat('a',32))->>'token' is null;
 perform public.revoke_run_share(repeat('a',32));
 begin perform public.publish_run_share(repeat('a',32),current_setting('share.fixture')::jsonb);raise exception 'other account published run';exception when invalid_parameter_value then null;end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$declare result jsonb;begin
 result:=public.read_run_share(current_setting('share.token'));
 assert result=current_setting('share.fixture')::jsonb,'public payload contains only the chosen geometry and summary';
 assert public.read_run_share('invalid') is null;
 assert public.read_run_share(repeat('0',64)) is null;
 begin perform * from public.run_shares;raise exception 'public enumeration allowed';exception when insufficient_privilege then null;end;
 begin perform * from public.personal_records;raise exception 'private records visible';exception when insufficient_privilege then null;end;
 begin perform public.get_run_share(repeat('a',32));raise exception 'anon ownership lookup';exception when insufficient_privilege then null;end;
 begin perform public.publish_run_share(repeat('a',32),current_setting('share.fixture')::jsonb);raise exception 'anon publish';exception when insufficient_privilege then null;end;
 begin perform public.revoke_run_share(repeat('a',32));raise exception 'anon revoke';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$declare replacement text;begin
 perform public.revoke_run_share(repeat('a',32));perform public.revoke_run_share(repeat('a',32));
 assert public.read_run_share(current_setting('share.token')) is null;
 replacement:=public.publish_run_share(repeat('a',32),current_setting('share.fixture')::jsonb)->>'token';
 assert replacement<>current_setting('share.token'),'revoked links must never revive';
 perform set_config('share.replacement',replacement,true);
end $$;
reset role;
update public.personal_records set deleted=true,summary=null where owner_id='11111111-1111-4111-8111-111111111111' and kind='run' and record_id=repeat('a',32);
do $$begin assert public.read_run_share(current_setting('share.replacement')) is null;assert (select count(*) from public.run_shares where owner_id='11111111-1111-4111-8111-111111111111')=0;end $$;
update public.personal_records set deleted=false,summary=jsonb_build_object('id',repeat('a',32),'status','completed','distanceM',123,'activeMs',65000,'pointCount',4) where owner_id='11111111-1111-4111-8111-111111111111' and kind='run' and record_id=repeat('a',32);
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('share.last',public.publish_run_share(repeat('a',32),current_setting('share.fixture')::jsonb)->>'token',true);
reset role;
select public.begin_account_deletion('11111111-1111-4111-8111-111111111111');
do $$begin assert public.read_run_share(current_setting('share.last')) is null,'deleting account must immediately hide public data';end $$;
set local role authenticated;
do $$begin
 begin perform public.publish_run_share(repeat('a',32),current_setting('share.fixture')::jsonb);raise exception 'deleting account published';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
do $$begin assert (select count(*) from public.run_shares where owner_id='11111111-1111-4111-8111-111111111111')=0,'account deletion cascades shares';end $$;
select 'PASS: owner/anonymous access, three overlays, gap preservation, retries, invalid data, revoke/new link, record deletion and account deletion' as run_sharing_verification;
rollback;
