-- Synthetic rows, transaction rollback. Does not remove real Storage bytes.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('33333333-3333-4333-8333-333333333333','photo-a@example.invalid','{"full_name":"원래 이름","unrelated":"keep"}'),
 ('44444444-4444-4444-8444-444444444444','photo-b@example.invalid','{}');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
insert into storage.objects(bucket_id,name) values('profile-photos','33333333-3333-4333-8333-333333333333/'||repeat('a',64)||'.jpg');
do $$ declare result jsonb; begin
 begin insert into storage.objects(bucket_id,name) values('profile-photos','44444444-4444-4444-8444-444444444444/'||repeat('b',64)||'.jpg');
   raise exception 'foreign upload allowed'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('profile-photos','33333333-3333-4333-8333-333333333333/unsafe.png');
   raise exception 'invalid upload allowed'; exception when insufficient_privilege then null; end;
 result:=public.save_account_profile('33333333-3333-4333-8333-333333333333',' 새 러너 ','uploaded','33333333-3333-4333-8333-333333333333/'||repeat('a',64)||'.jpg',null,'55555555-5555-4555-8555-555555555555');
 assert result->>'outcome'='applied','first photo commit';
 result:=public.save_account_profile('33333333-3333-4333-8333-333333333333','새 러너','uploaded','33333333-3333-4333-8333-333333333333/'||repeat('a',64)||'.jpg',null,'55555555-5555-4555-8555-555555555555');
 assert result->>'outcome'='applied','lost response idempotency';
 assert not public.profile_photo_unreferenced('33333333-3333-4333-8333-333333333333/'||repeat('a',64)||'.jpg'),'live image protected';
 begin perform public.save_account_profile('33333333-3333-4333-8333-333333333333','다른 내용','initials',null,null,'55555555-5555-4555-8555-555555555555');
   raise exception 'mutation reused with different data'; exception when invalid_parameter_value then null; end;
 result:=public.save_account_profile('33333333-3333-4333-8333-333333333333','덮어쓰기','initials',null,null,'66666666-6666-4666-8666-666666666666');
 assert result->>'outcome'='conflict','concurrent stale editor blocked';
 begin perform public.save_account_profile('33333333-3333-4333-8333-333333333333','사진 누락','uploaded','33333333-3333-4333-8333-333333333333/'||repeat('c',64)||'.jpg','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666');
   raise exception 'missing image accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.save_account_profile('33333333-3333-4333-8333-333333333333','타인 사진','uploaded','44444444-4444-4444-8444-444444444444/'||repeat('b',64)||'.jpg','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666');
   raise exception 'foreign photo accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.account_deletion_profile_photos('33333333-3333-4333-8333-333333333333');
   raise exception 'client enumerated admin photos'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 assert (select raw_user_meta_data->>'full_name'='원래 이름' and raw_user_meta_data->>'unrelated'='keep' from auth.users where id='33333333-3333-4333-8333-333333333333'),'provider metadata preserved';
 assert (select not public from storage.buckets where id='profile-photos'),'private bucket';
end $$;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
set local role authenticated;
do $$ begin
 assert (select count(*)=0 from storage.objects where bucket_id='profile-photos'),'foreign reads denied';
 assert not public.profile_photo_unreferenced('33333333-3333-4333-8333-333333333333/'||repeat('a',64)||'.jpg'),'foreign delete denied';
 begin perform public.save_account_profile('33333333-3333-4333-8333-333333333333','계정 전환','initials',null,null,'77777777-7777-4777-8777-777777777777');
   raise exception 'save switched to another account'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 assert (select count(*)=0 from storage.objects where bucket_id='profile-photos'),'anonymous reads denied';
 begin perform public.save_account_profile('33333333-3333-4333-8333-333333333333','익명','initials',null,null,'77777777-7777-4777-8777-777777777777');
   raise exception 'anonymous save allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
select public.save_account_profile('33333333-3333-4333-8333-333333333333','기본 이미지','initials',null,'55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666');
do $$ begin
 assert public.profile_photo_unreferenced('33333333-3333-4333-8333-333333333333/'||repeat('a',64)||'.jpg'),'replaced image may be cleaned';
end $$;
reset role;
set local role service_role;
select public.begin_account_deletion('33333333-3333-4333-8333-333333333333');
do $$ begin
 assert jsonb_array_length(public.account_deletion_profile_photos('33333333-3333-4333-8333-333333333333'))=1,'deletion enumerates orphan photos';
end $$;
reset role;
set local role authenticated;
do $$ begin
 assert (select count(*)=0 from storage.objects where bucket_id='profile-photos'),'withdrawal hides photos';
 begin perform public.save_account_profile('33333333-3333-4333-8333-333333333333','재시도','initials',null,'66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777');
   raise exception 'withdrawal save allowed'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('profile-photos','33333333-3333-4333-8333-333333333333/'||repeat('d',64)||'.jpg');
   raise exception 'withdrawal upload allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: private photos, ownership, atomic profile, conflict/idempotency, metadata preservation, cleanup and withdrawal' as profile_photo_verification;
rollback;
