-- Private, immutable profile images. Deploy the photo-aware deletion function
-- before enabling EXPO_PUBLIC_PROFILE_PHOTOS_ENABLED in any distributed build.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photos','profile-photos',false,1048576,array['image/jpeg']);

create policy profile_photos_read_own on storage.objects for select to authenticated
using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy profile_photos_insert_own on storage.objects for insert to authenticated
with check(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text
 and name ~ '^[a-f0-9-]{36}/[a-f0-9]{64}\.jpg$');
create policy profile_photos_active_account on storage.objects as restrictive for all to authenticated
using(bucket_id<>'profile-photos' or (select public.personal_account_active()))
with check(bucket_id<>'profile-photos' or (select public.personal_account_active()));

-- Serialize pointer commits and physical-object deletion authorization. The
-- existing account gate also serializes both with account withdrawal.
create function public.profile_photo_unreferenced(p_path text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_path text;
begin
 if actor is null or p_path is null or p_path !~ ('^'||actor::text||'/[a-f0-9]{64}\.jpg$') then return false; end if;
 if not public.personal_account_active() then return false; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('profile/'||actor::text,0));
 select raw_user_meta_data->>'runpen_photo_path' into current_path from auth.users where id=actor;
 return p_path is distinct from current_path;
end;
$$;
revoke all on function public.profile_photo_unreferenced(text) from public,anon,authenticated;
grant execute on function public.profile_photo_unreferenced(text) to authenticated;
create policy profile_photos_delete_unreferenced on storage.objects for delete to authenticated
using(bucket_id='profile-photos' and public.profile_photo_unreferenced(name));

-- Save all RunPen profile fields in one transaction. Legacy Google metadata and
-- unrelated Auth metadata remain intact; images/URLs never go into JWT payloads.
create function public.save_account_profile(
 p_owner uuid,p_nickname text,p_picture text,p_photo_path text,p_expected_revision text,p_mutation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); metadata jsonb; revision text; nickname text;
begin
 if actor is null or actor is distinct from p_owner or not public.personal_account_active() then raise exception 'Account unavailable' using errcode='42501'; end if;
 nickname:=btrim(normalize(p_nickname,NFC));
 if nickname is null or char_length(nickname) not between 1 and 20 or nickname ~ '[[:cntrl:]]'
   or p_picture is null or p_picture not in ('provider','initials','uploaded') or p_mutation_id is null then
   raise exception 'Invalid profile' using errcode='22023';
 end if;
 if p_picture='uploaded' then
   if p_photo_path is null or p_photo_path !~ ('^'||actor::text||'/[a-f0-9]{64}\.jpg$') then
     raise exception 'Invalid photo path' using errcode='22023';
   end if;
 elsif p_photo_path is not null then raise exception 'Unexpected photo path' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('profile/'||actor::text,0));
 select coalesce(raw_user_meta_data,'{}'::jsonb) into metadata from auth.users where id=actor for update;
 if not found then raise exception 'Account unavailable' using errcode='42501'; end if;
 revision:=metadata->>'runpen_profile_revision';
 if revision=p_mutation_id::text then
   if metadata->>'runpen_nickname' is distinct from nickname or metadata->>'runpen_picture' is distinct from p_picture
     or metadata->>'runpen_photo_path' is distinct from p_photo_path then raise exception 'Mutation mismatch' using errcode='22023'; end if;
   return jsonb_build_object('outcome','applied','revision',revision);
 end if;
 if revision is distinct from p_expected_revision then return jsonb_build_object('outcome','conflict'); end if;
 if p_picture='uploaded' and not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=p_photo_path) then
   raise exception 'Photo not uploaded' using errcode='22023';
 end if;
 update auth.users set raw_user_meta_data=metadata||jsonb_build_object(
   'runpen_nickname',nickname,'runpen_picture',p_picture,'runpen_photo_path',p_photo_path,'runpen_profile_revision',p_mutation_id::text
 ),updated_at=now() where id=actor;
 return jsonb_build_object('outcome','applied','revision',p_mutation_id::text);
end;
$$;
revoke all on function public.save_account_profile(uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.save_account_profile(uuid,text,text,text,text,uuid) to authenticated;

create function public.account_deletion_profile_photos(p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare paths jsonb;
begin
 if not exists(select 1 from public.account_deletions where owner_id=p_owner) then raise exception 'Deletion not started' using errcode='42501'; end if;
 select coalesce(jsonb_agg(name order by name),'[]'::jsonb) into paths from (
   select name from storage.objects where bucket_id='profile-photos' and name like p_owner::text||'/%' order by name limit 100
 ) batch;
 return paths;
end;
$$;
revoke all on function public.account_deletion_profile_photos(uuid) from public,anon,authenticated;
grant execute on function public.account_deletion_profile_photos(uuid) to service_role;

commit;
