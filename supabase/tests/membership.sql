-- Transactional synthetic policy and accounts. Never publishes product terms.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','signup-a@example.invalid','{"runpen_nickname":"기존 이름","unrelated":"keep"}'),
 ('22222222-2222-4222-8222-222222222222','signup-b@example.invalid','{}');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$ begin
 assert (public.get_membership('11111111-1111-4111-8111-111111111111')->>'completedAt') is null,'new account starts pending';
 begin perform public.accept_membership('11111111-1111-4111-8111-111111111111','qa-v1',true,true,'33333333-3333-4333-8333-333333333333');
   raise exception 'unpublished consent accepted'; exception when invalid_parameter_value then null; end;
 begin update public.memberships set completed_at=now(); raise exception 'direct update accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.membership_policies(id,terms_body,privacy_body) values('bad','x','y'); raise exception 'client published terms'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.membership_policies(id,terms_body,privacy_body,active) values('qa-v1','검증용 이용약관, 배포 금지','검증용 개인정보, 배포 금지',true);
set local role authenticated;
do $$ declare receipt jsonb; begin
 assert public.get_membership_policy()->>'id'='qa-v1','published exact policy readable';
 begin perform public.accept_membership('11111111-1111-4111-8111-111111111111','qa-v1',true,false,'33333333-3333-4333-8333-333333333333');
   raise exception 'missing required accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.accept_membership('22222222-2222-4222-8222-222222222222','qa-v1',true,true,'33333333-3333-4333-8333-333333333333');
   raise exception 'foreign account accepted'; exception when insufficient_privilege then null; end;
 receipt:=public.accept_membership('11111111-1111-4111-8111-111111111111','qa-v1',true,true,'33333333-3333-4333-8333-333333333333');
 assert receipt->>'completedAt' is not null,'actual completion';
 assert receipt=public.accept_membership('11111111-1111-4111-8111-111111111111','qa-v1',true,true,'33333333-3333-4333-8333-333333333333'),'response loss repeats exact receipt';
 assert (select count(*)=1 from public.membership_consents),'one consent for repeated request';
 assert (select count(*)=1 from public.memberships),'own account only';
 begin perform public.accept_membership('11111111-1111-4111-8111-111111111111','qa-v2',true,true,'33333333-3333-4333-8333-333333333333');
   raise exception 'request reuse accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 assert (select raw_user_meta_data='{"runpen_nickname":"기존 이름","unrelated":"keep"}'::jsonb from auth.users where id='11111111-1111-4111-8111-111111111111'),'Auth metadata preserved';
 begin update public.membership_policies set terms_body='silent edit' where id='qa-v1'; raise exception 'version content rewritten'; exception when invalid_parameter_value then null; end;
end $$;
update public.membership_policies set active=false where id='qa-v1';
insert into public.membership_policies(id,terms_body,privacy_body,active) values('qa-v2','두 번째 검증용 약관','두 번째 검증용 개인정보',true);
set local role authenticated;
do $$ declare original text; begin
 original:=public.get_membership('11111111-1111-4111-8111-111111111111')->>'completedAt';
 begin perform public.accept_membership('11111111-1111-4111-8111-111111111111','qa-v1',true,true,'44444444-4444-4444-8444-444444444444');
   raise exception 'stale policy accepted'; exception when invalid_parameter_value then null; end;
 assert public.accept_membership('11111111-1111-4111-8111-111111111111','qa-v2',true,true,'44444444-4444-4444-8444-444444444444')->>'completedAt'=original,'first completion preserved';
 assert public.accept_membership('11111111-1111-4111-8111-111111111111','qa-v1',true,true,'33333333-3333-4333-8333-333333333333')->>'policyId'='qa-v2','old replay cannot undo reconsent';
end $$;
reset role;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
do $$ begin
 assert (select count(*)=0 from public.membership_consents),'foreign consent history hidden';
 begin perform public.get_membership('11111111-1111-4111-8111-111111111111'); raise exception 'foreign RPC read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 assert public.get_membership_policy()->>'id'='qa-v2','guest can read published terms';
 begin perform public.get_membership('11111111-1111-4111-8111-111111111111'); raise exception 'anonymous membership read'; exception when insufficient_privilege then null; end;
 begin perform public.accept_membership('11111111-1111-4111-8111-111111111111','qa-v2',true,true,'55555555-5555-4555-8555-555555555555'); raise exception 'anonymous acceptance'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select public.begin_account_deletion('11111111-1111-4111-8111-111111111111');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$ begin
 assert (select count(*)=0 from public.memberships),'deleting account hidden';
 begin perform public.accept_membership('11111111-1111-4111-8111-111111111111','qa-v2',true,true,'44444444-4444-4444-8444-444444444444'); raise exception 'deleting account replay'; exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
do $$ begin
 assert (select count(*)=0 from public.membership_consents),'consent deletion cascade';
 assert (select count(*)=0 from public.memberships where owner_id='11111111-1111-4111-8111-111111111111'),'membership deletion cascade';
end $$;
select 'PASS: signup required/version/receipt/ownership/deletion/metadata checks' as membership_verification;
rollback;
