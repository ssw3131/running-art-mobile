begin;
insert into auth.users(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
set local role anon;
do $$ begin
 begin perform public.list_service_inquiries(); raise exception 'anonymous read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
set local role authenticated;
do $$ declare first jsonb; again jsonb; begin
 if jsonb_array_length(public.list_service_inquiries()->'items')<>0 then raise exception 'empty state'; end if;
 first:=public.submit_service_inquiry(auth.uid(),'11111111-1111-4111-8111-111111111111','기타','원문','본문','legacy@example.invalid');
 perform public.update_service_inquiry('11111111-1111-4111-8111-111111111111',1,'기타','수정','본문');
 again:=public.submit_service_inquiry(auth.uid(),'11111111-1111-4111-8111-111111111111','기타','원문','본문');
 if first<>again then raise exception 'editing broke original receipt'; end if;
 if public.get_service_inquiry('11111111-1111-4111-8111-111111111111')->>'title'<>'수정' then raise exception 'edit missing'; end if;
 begin perform public.update_service_inquiry('11111111-1111-4111-8111-111111111111',1,'기타','stale','본문'); raise exception 'stale version accepted'; exception when serialization_failure then null; end;
 begin update public.service_inquiries set reply_body='forged'; raise exception 'user forged reply'; exception when insufficient_privilege then null; end;
 begin perform 1 from support_private.inquiry_requests; raise exception 'ledger leaked'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.service_inquiries set reply_body='운영팀 답변' where request_id='11111111-1111-4111-8111-111111111111';
do $$ declare row public.service_inquiries; begin
 select * into row from public.service_inquiries where request_id='11111111-1111-4111-8111-111111111111';
 if row.status<>'답변 완료' or row.replied_at is null or row.reply_updated_at<>row.replied_at or row.version<>3 then raise exception 'automatic reply fields'; end if;
 begin update public.service_inquiries set reply_body=' '; raise exception 'cleared reply'; exception when invalid_parameter_value then null; end;
 begin update public.service_inquiries set title='changed after reply'; raise exception 'changed replied original'; exception when serialization_failure then null; end;
end $$;
update public.service_inquiries set reply_body='정정 답변' where request_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
do $$ begin
 begin perform public.update_service_inquiry('11111111-1111-4111-8111-111111111111',2,'기타','late','본문'); raise exception 'late edit accepted'; exception when serialization_failure then null; end;
 begin perform public.delete_service_inquiry('11111111-1111-4111-8111-111111111111',4); raise exception 'answered delete accepted'; exception when serialization_failure then null; end;
 if public.get_service_inquiry('11111111-1111-4111-8111-111111111111')->>'reply'<>'정정 답변' then raise exception 'reply not visible'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
set local role authenticated;
do $$ declare result jsonb; begin
 if jsonb_array_length(public.list_service_inquiries()->'items')<>0 then raise exception 'other owner listed'; end if;
 begin perform public.get_service_inquiry('11111111-1111-4111-8111-111111111111'); raise exception 'other owner detail'; exception when no_data_found then null; end;
 begin perform public.update_service_inquiry('11111111-1111-4111-8111-111111111111',4,'기타','attack','body'); raise exception 'other owner edit'; exception when no_data_found then null; end;
 perform public.delete_service_inquiry('11111111-1111-4111-8111-111111111111',4);
 result:=public.submit_service_inquiry(auth.uid(),'22222222-2222-4222-8222-222222222222','기타','삭제','본문');
 perform public.delete_service_inquiry('22222222-2222-4222-8222-222222222222',1);
 perform public.delete_service_inquiry('22222222-2222-4222-8222-222222222222',1);
 result:=public.submit_service_inquiry(auth.uid(),'22222222-2222-4222-8222-222222222222','기타','삭제','본문');
 if result->>'deleted'<>'true' or jsonb_array_length(public.list_service_inquiries()->'items')<>0 then raise exception 'deleted inquiry resurrected'; end if;
 for i in 1..4 loop
  perform public.submit_service_inquiry(auth.uid(),gen_random_uuid(),'기타','신규','본문');
 end loop;
 begin perform public.submit_service_inquiry(auth.uid(),gen_random_uuid(),'기타','초과','본문'); raise exception 'deletion bypassed limit' using errcode='22023'; exception when raise_exception then if sqlerrm<>'Inquiry rate limit' then raise; end if; end;
end $$;
reset role;
-- Same timestamp pagination uses request UUID as the stable tie-breaker.
insert into public.service_inquiries(owner_id,request_id,category,title,body,received_at)
 select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'기타','페이지','본문','2020-01-01' from generate_series(1,21);
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
set local role authenticated;
do $$ declare page jsonb; next_page jsonb; begin
 page:=public.list_service_inquiries();
 if jsonb_array_length(page->'items')<>20 or page->'next'='null'::jsonb then raise exception 'first page'; end if;
 next_page:=public.list_service_inquiries((page->'next'->>'receivedAt')::timestamptz,(page->'next'->>'id')::uuid);
 if jsonb_array_length(next_page->'items')<>2 or next_page->'next'<>'null'::jsonb then raise exception 'second page'; end if;
 if exists(select 1 from jsonb_array_elements(page->'items') a,jsonb_array_elements(next_page->'items') b where a->>'id'=b->>'id') then raise exception 'page overlap'; end if;
end $$;
reset role;
delete from auth.users where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
do $$ begin
 if exists(select 1 from public.service_inquiries) or exists(select 1 from support_private.inquiry_requests) then raise exception 'withdrawal leftovers'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='service_inquiries' and column_name='contact_email') then raise exception 'email retained'; end if;
end $$;
select 'PASS: private board, email removal, pagination, reply triggers, version conflicts, immutable original, ledger retries, delete/rate limit and withdrawal' as inquiry_board_verification;
rollback;
