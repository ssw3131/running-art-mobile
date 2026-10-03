-- Running Art Mobile: account-private summaries and immutable coordinate files.
-- Apply as one transaction. No existing account or local user data is changed.
begin;

create table public.personal_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('course','run')),
  record_id text not null check(record_id ~ '^[a-f0-9]{32}$'),
  version bigint not null check(version>0),
  mutation_id text not null check(mutation_id ~ '^[a-f0-9]{32}$'),
  deleted boolean not null default false,
  summary jsonb,
  payload_path text,
  payload_hash text check(payload_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now(),
  primary key(owner_id,kind,record_id),
  check((deleted and summary is null) or (not deleted and summary is not null and payload_path is not null and payload_hash is not null)),
  check(payload_path is null or payload_path=owner_id::text||'/'||kind||'/'||record_id||'/'||payload_hash||'.json'),
  check(octet_length(summary::text)<=8192)
);
alter table public.personal_records enable row level security;
revoke all on public.personal_records from public,anon,authenticated;
grant select on public.personal_records to authenticated;
create policy personal_records_read_own on public.personal_records for select to authenticated using((select auth.uid())=owner_id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('personal-records','personal-records',false,25165824,array['application/json']);
create policy personal_files_read_own on storage.objects for select to authenticated
using(bucket_id='personal-records' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy personal_files_insert_own on storage.objects for insert to authenticated
with check(bucket_id='personal-records' and (storage.foldername(name))[1]=(select auth.uid())::text
 and name ~ '^[a-f0-9-]{36}/(course|run)/[a-f0-9]{32}/[a-f0-9]{64}\.json$');
-- Published live files are immutable, including protection from a late delete retry.
create policy personal_files_delete_unreferenced on storage.objects for delete to authenticated
using(bucket_id='personal-records' and (storage.foldername(name))[1]=(select auth.uid())::text
 and not exists(select 1 from public.personal_records r where r.owner_id=(select auth.uid()) and not r.deleted and r.payload_path=name));

create function public.commit_personal_record(
 p_kind text,p_id text,p_expected_version bigint,p_mutation_id text,
 p_deleted boolean,p_summary jsonb,p_payload_path text,p_payload_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();
 current_record public.personal_records;
 result_record public.personal_records;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('course','run') or p_id is null or p_id !~ '^[a-f0-9]{32}$'
   or p_mutation_id is null or p_mutation_id !~ '^[a-f0-9]{32}$' or p_expected_version is null or p_expected_version<0 or p_deleted is null
 then raise exception 'Invalid record request' using errcode='22023'; end if;
 -- Serialize creation as well as updates for this owner's record.
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
comment on table public.personal_records is 'Personal course/run sync v1. Coordinates are private Storage objects; tombstones prevent stale restoration.';
notify pgrst,'reload schema';
commit;
