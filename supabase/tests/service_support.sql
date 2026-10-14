begin;
insert into auth.users(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.service_notices(id,title,body,category,published,published_at) values
 ('live','실제 시험 공지','시험 본문','공지',true,now()-interval '1 minute'),
 ('draft','초안','숨겨진 본문','공지',false,now()),
 ('future','미래','숨겨진 본문','공지',true,now()+interval '1 day');
set local role anon;
do $$ begin
 if jsonb_array_length(public.get_service_notices())<>1 then raise exception 'notice publication boundary'; end if;
 if public.get_service_policy('terms') is not null then raise exception 'no fabricated terms'; end if;
 begin
  perform public.submit_service_inquiry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','기타','제목','본문','');
  raise exception 'anonymous inquiry allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
set local role authenticated;
do $$ declare a jsonb; b jsonb; begin
 a:=public.submit_service_inquiry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','기타','제목','본문','');
 b:=public.submit_service_inquiry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','기타','제목','본문','');
 if a is distinct from b then raise exception 'retry receipt differs'; end if;
 if (select count(*) from public.service_inquiries)<>1 then raise exception 'retry duplicated'; end if;
 begin
  perform public.submit_service_inquiry('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',gen_random_uuid(),'기타','제목','본문','');
  raise exception 'other owner accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.submit_service_inquiry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','기타','변경','본문','');
  raise exception 'changed retry accepted';
 exception when invalid_parameter_value then null; end;
 begin
  insert into public.service_inquiries(owner_id,request_id,category,title,body) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'기타','직접','쓰기');
  raise exception 'direct write bypass';
 exception when insufficient_privilege then null; end;
 for i in 1..4 loop
  perform public.submit_service_inquiry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'기타','제목','본문','reply@example.invalid');
 end loop;
 begin
  perform public.submit_service_inquiry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'기타','제목','본문','');
  raise exception 'rate limit missing' using errcode='22023';
 exception when raise_exception then if sqlerrm<>'Inquiry rate limit' then raise; end if; end;
 perform public.submit_service_inquiry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','기타','제목','본문','');
end $$;
reset role;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.service_inquiries) then raise exception 'other account data visible'; end if;
end $$;
reset role;
delete from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$ begin
 if exists(select 1 from public.service_inquiries) then raise exception 'withdrawal leaves inquiries'; end if;
end $$;
select 'PASS: support publication, owner RLS, anonymous/direct-write rejection, idempotency, conflict, rate limit and account-delete cascade' as service_support_verification;
rollback;
