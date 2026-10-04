-- Account deletion gate and private-record write barrier.
-- Applied to the hosted project and verified with disposable accounts on 2026-10-04.
begin;

create table public.account_deletions (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 started_at timestamptz not null default now()
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from public,anon,authenticated;
grant all on public.account_deletions to service_role;

-- The shared transaction lock makes deletion's exclusive lock wait for already
-- accepted uploads/commits. VOLATILE is intentional: the post-lock queries need
-- a fresh READ COMMITTED snapshot when another transaction was holding the lock.
create function public.personal_account_active() returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null then return false; end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('account/'||actor::text,0));
 return exists(select 1 from auth.users where id=actor)
   and not exists(select 1 from public.account_deletions where owner_id=actor);
end;
$$;
revoke all on function public.personal_account_active() from public,anon,authenticated;
grant execute on function public.personal_account_active() to authenticated;

-- Restrictive policies compose with the existing ownership/path permissions.
-- They also deny a deleted user's still-unexpired JWT, even after marker cascade.
create policy personal_records_active_account on public.personal_records
as restrictive for select to authenticated using((select public.personal_account_active()));
create policy personal_files_active_account on storage.objects
as restrictive for all to authenticated
using(bucket_id<>'personal-records' or (select public.personal_account_active()))
with check(bucket_id<>'personal-records' or (select public.personal_account_active()));

create function public.begin_account_deletion(p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_owner is null then raise exception 'Owner required' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account/'||p_owner::text,0));
 if not exists(select 1 from auth.users where id=p_owner) then
   raise exception 'Account unavailable' using errcode='22023';
 end if;
 insert into public.account_deletions(owner_id) values(p_owner) on conflict(owner_id) do nothing;
end;
$$;
revoke all on function public.begin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.begin_account_deletion(uuid) to service_role;

-- Read metadata only. All actual object removal goes through Storage API, never
-- SQL DELETE, which can orphan the underlying bytes. No offset after removals.
create function public.account_deletion_files(p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare paths jsonb;
begin
 if not exists(select 1 from public.account_deletions where owner_id=p_owner) then
   raise exception 'Deletion not started' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(name order by name),'[]'::jsonb) into paths from (
   select name from storage.objects
   where bucket_id='personal-records' and name like p_owner::text||'/%'
   order by name limit 100
 ) batch;
 return paths;
end;
$$;
revoke all on function public.account_deletion_files(uuid) from public,anon,authenticated;
grant execute on function public.account_deletion_files(uuid) to service_role;

-- The existing SECURITY DEFINER commit bypasses RLS. Guard it explicitly before
-- its idempotent return, including retries of mutations written before deletion.
create or replace function public.commit_personal_record(
 p_kind text,p_id text,p_expected_version bigint,p_mutation_id text,
 p_deleted boolean,p_summary jsonb,p_payload_path text,p_payload_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();
 current_record public.personal_records;
 result_record public.personal_records;
begin
 if actor is null or not public.personal_account_active() then
   raise exception 'Account unavailable' using errcode='42501';
 end if;
 if p_kind is null or p_kind not in ('course','run') or p_id is null or p_id !~ '^[a-f0-9]{32}$'
   or p_mutation_id is null or p_mutation_id !~ '^[a-f0-9]{32}$' or p_expected_version is null or p_expected_version<0 or p_deleted is null
 then raise exception 'Invalid record request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||'/'||p_kind||'/'||p_id,0));
 select * into current_record from public.personal_records where owner_id=actor and kind=p_kind and record_id=p_id for update;
 if found and current_record.mutation_id=p_mutation_id then
   return jsonb_build_object('outcome','applied','record',to_jsonb(current_record));
 end if;
 if coalesce(current_record.version,0)<>p_expected_version then
   return jsonb_build_object('outcome','conflict','record',to_jsonb(current_record));
 end if;
 if not p_deleted then
   if p_summary is null or jsonb_typeof(p_summary)<>'object' or octet_length(p_summary::text)>8192
      or p_summary->>'id' is distinct from p_id
      or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
      or p_payload_path is distinct from actor::text||'/'||p_kind||'/'||p_id||'/'||p_payload_hash||'.json'
      or (p_kind='course' and (p_summary->>'name' is null or length(btrim(p_summary->>'name')) not between 1 and 80))
      or (p_kind='run' and p_summary->>'status' is distinct from 'completed')
   then raise exception 'Invalid summary or path' using errcode='22023'; end if;
   if not exists(select 1 from storage.objects where bucket_id='personal-records' and name=p_payload_path) then
     raise exception 'Payload must be uploaded first' using errcode='22023';
   end if;
 end if;
 insert into public.personal_records(owner_id,kind,record_id,version,mutation_id,deleted,summary,payload_path,payload_hash)
 values(actor,p_kind,p_id,coalesce(current_record.version,0)+1,p_mutation_id,p_deleted,
   case when p_deleted then null else p_summary end,
   case when p_deleted then current_record.payload_path else p_payload_path end,
   case when p_deleted then current_record.payload_hash else p_payload_hash end)
 on conflict(owner_id,kind,record_id) do update set version=excluded.version,mutation_id=excluded.mutation_id,deleted=excluded.deleted,
   summary=excluded.summary,payload_path=excluded.payload_path,payload_hash=excluded.payload_hash,updated_at=now()
 returning * into result_record;
 return jsonb_build_object('outcome','applied','record',to_jsonb(result_record));
end;
$$;
revoke all on function public.commit_personal_record(text,text,bigint,text,boolean,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.commit_personal_record(text,text,bigint,text,boolean,jsonb,text,text) to authenticated;

comment on table public.account_deletions is 'Transient, irreversible deletion-in-progress gate. No automatic unlock after partial file removal; retry deletion. Cascades with Auth user.';
notify pgrst,'reload schema';
commit;
