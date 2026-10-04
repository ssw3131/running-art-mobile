-- Explicit link sharing of completed, account-owned, synchronized runs.
-- Existing personal tables/files remain private. Deploy after the two prior migrations.
begin;

create table public.run_shares (
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null default 'run' check(kind='run'),
 run_id text not null check(run_id ~ '^[a-f0-9]{32}$'),
 token text not null unique default (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')) check(token ~ '^[a-f0-9]{64}$'),
 snapshot jsonb not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,run_id),
 foreign key(owner_id,kind,run_id) references public.personal_records(owner_id,kind,record_id) on delete cascade,
 check(octet_length(snapshot::text)<=8388608)
);
alter table public.run_shares enable row level security;
revoke all on public.run_shares from public,anon,authenticated;
grant all on public.run_shares to service_role;

create function public.validate_run_share_snapshot(p_snapshot jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare s jsonb; p jsonb; n bigint:=0; has_line boolean:=false;
begin
 if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object'
  or p_snapshot->'schemaVersion' is distinct from '1'::jsonb
  or (select array_agg(k order by k) from jsonb_object_keys(p_snapshot) k) is distinct from array['activeMs','distanceM','planned','schemaVersion','segments','title']
  or jsonb_typeof(p_snapshot->'title')<>'string' or length(btrim(p_snapshot->>'title')) not between 1 and 80
  or jsonb_typeof(p_snapshot->'distanceM')<>'number' or (p_snapshot->>'distanceM')::numeric not between 0 and 10000000
  or jsonb_typeof(p_snapshot->'activeMs')<>'number' or (p_snapshot->>'activeMs')::numeric not between 0 and 31536000000
  or (p_snapshot->>'activeMs')::numeric<>trunc((p_snapshot->>'activeMs')::numeric)
  or jsonb_typeof(p_snapshot->'segments')<>'array' or jsonb_array_length(p_snapshot->'segments') not between 1 and 100000
  or octet_length(p_snapshot::text)>8388608
 then raise exception 'Invalid share snapshot' using errcode='22023'; end if;
 for s in select value from jsonb_array_elements(p_snapshot->'segments') loop
  if jsonb_typeof(s)<>'array' or jsonb_array_length(s)<1 then raise exception 'Invalid segment' using errcode='22023'; end if;
  n:=n+jsonb_array_length(s); has_line:=has_line or jsonb_array_length(s)>1;
  if n>100000 then raise exception 'Too many points' using errcode='22023'; end if;
  for p in select value from jsonb_array_elements(s) loop
   if jsonb_typeof(p)<>'array' or jsonb_array_length(p)<>2
    or jsonb_typeof(p->0)<>'number' or jsonb_typeof(p->1)<>'number'
    or (p->>0)::numeric not between -180 and 180 or (p->>1)::numeric not between -90 and 90
   then raise exception 'Invalid coordinate' using errcode='22023'; end if;
  end loop;
 end loop;
 if not has_line then raise exception 'Missing path' using errcode='22023'; end if;
 if p_snapshot->'planned'<>'null'::jsonb then
  if jsonb_typeof(p_snapshot->'planned')<>'object'
   or (select array_agg(k order by k) from jsonb_object_keys(p_snapshot->'planned') k) is distinct from array['route','target']
  then raise exception 'Invalid planned geometry' using errcode='22023'; end if;
  for s in select value from jsonb_each(p_snapshot->'planned') loop
   if jsonb_typeof(s)<>'array' or jsonb_array_length(s) not between 2 and 20000 then raise exception 'Invalid planned path' using errcode='22023'; end if;
   for p in select value from jsonb_array_elements(s) loop
    if jsonb_typeof(p)<>'array' or jsonb_array_length(p)<>2 or jsonb_typeof(p->0)<>'number' or jsonb_typeof(p->1)<>'number'
     or (p->>0)::numeric not between -180 and 180 or (p->>1)::numeric not between -90 and 90
    then raise exception 'Invalid planned coordinate' using errcode='22023'; end if;
   end loop;
  end loop;
 end if;
end;
$$;
revoke all on function public.validate_run_share_snapshot(jsonb) from public,anon,authenticated;

create function public.publish_run_share(p_run_id text,p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); record public.personal_records; link text;
begin
 if not public.personal_account_active() then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_run_id is null or p_run_id !~ '^[a-f0-9]{32}$' then raise exception 'Invalid run' using errcode='22023'; end if;
 -- Match personal-record commit lock order; never publish against a deletion.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||'/run/'||p_run_id,0));
 select * into record from public.personal_records where owner_id=actor and kind='run' and record_id=p_run_id for update;
 if not found or record.deleted or record.summary->>'status' is distinct from 'completed' then
  raise exception 'Synchronize the completed run first' using errcode='22023';
 end if;
 perform public.validate_run_share_snapshot(p_snapshot);
 if (p_snapshot->>'distanceM')::numeric is distinct from (record.summary->>'distanceM')::numeric
  or (p_snapshot->>'activeMs')::numeric is distinct from (record.summary->>'activeMs')::numeric
  or (select sum(jsonb_array_length(s)) from jsonb_array_elements(p_snapshot->'segments') s) is distinct from (record.summary->>'pointCount')::numeric
 then raise exception 'Snapshot differs from saved run' using errcode='22023'; end if;
 insert into public.run_shares(owner_id,run_id,snapshot) values(actor,p_run_id,p_snapshot)
 on conflict(owner_id,run_id) do nothing;
 select token into link from public.run_shares where owner_id=actor and run_id=p_run_id;
 return jsonb_build_object('token',link);
end;
$$;
revoke all on function public.publish_run_share(text,jsonb) from public,anon,authenticated;
grant execute on function public.publish_run_share(text,jsonb) to authenticated;

create function public.get_run_share(p_run_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link text;
begin
 if not public.personal_account_active() then raise exception 'Authentication required' using errcode='42501'; end if;
 select token into link from public.run_shares where owner_id=auth.uid() and run_id=p_run_id;
 return jsonb_build_object('token',link);
end;
$$;
revoke all on function public.get_run_share(text) from public,anon,authenticated;
grant execute on function public.get_run_share(text) to authenticated;

create function public.revoke_run_share(p_run_id text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if not public.personal_account_active() then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||'/run/'||p_run_id,0));
 delete from public.run_shares where owner_id=actor and run_id=p_run_id;
end;
$$;
revoke all on function public.revoke_run_share(text) from public,anon,authenticated;
grant execute on function public.revoke_run_share(text) to authenticated;

create function public.read_run_share(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select s.snapshot into result from public.run_shares s
 join public.personal_records r on r.owner_id=s.owner_id and r.kind='run' and r.record_id=s.run_id
 where s.token=p_token and not r.deleted
 and not exists(select 1 from public.account_deletions d where d.owner_id=s.owner_id);
 return result;
end;
$$;
revoke all on function public.read_run_share(text) from public,anon,authenticated;
grant execute on function public.read_run_share(text) to anon,authenticated;

create function public.remove_run_share_on_record_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- A source update can invalidate its immutable public snapshot. Do not silently
 -- expand a previously shared route; require the owner to explicitly share again.
 if new.kind='run' and (new.deleted or (tg_op='UPDATE' and new.payload_hash is distinct from old.payload_hash)) then
  delete from public.run_shares where owner_id=new.owner_id and run_id=new.record_id;
 end if;
 return new;
end;
$$;
revoke all on function public.remove_run_share_on_record_change() from public,anon,authenticated;
create trigger personal_run_share_cleanup after insert or update on public.personal_records
for each row execute function public.remove_run_share_on_record_change();
commit;
