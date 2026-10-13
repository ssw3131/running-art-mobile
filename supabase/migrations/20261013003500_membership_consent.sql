-- S1: server-owned membership and versioned consent, independent of Auth metadata.
-- No draft/legal text is published by this migration. Publish a reviewed policy
-- separately, after reconciling the hosted schema and migration history.
begin;

create table public.membership_policies (
 id text primary key check (id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'),
 terms_body text not null check (char_length(btrim(terms_body)) between 1 and 100000),
 privacy_body text not null check (char_length(btrim(privacy_body)) between 1 and 100000),
 published_at timestamptz not null default now(),
 active boolean not null default false
);
create unique index membership_one_active_policy on public.membership_policies(active) where active;
alter table public.membership_policies enable row level security;
revoke all on public.membership_policies from public,anon,authenticated;
grant all on public.membership_policies to service_role;

create function public.preserve_membership_policy() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.id is distinct from old.id or new.terms_body is distinct from old.terms_body
    or new.privacy_body is distinct from old.privacy_body
    or new.published_at is distinct from old.published_at then
   raise exception 'Publish a new policy version' using errcode='22023';
 end if;
 return new;
end;
$$;
create trigger membership_policy_immutable before update on public.membership_policies
for each row execute function public.preserve_membership_policy();

create table public.memberships (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 policy_id text references public.membership_policies(id),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 consented_at timestamptz,
 check ((policy_id is null and completed_at is null and consented_at is null)
   or (policy_id is not null and completed_at is not null and consented_at is not null))
);
create table public.membership_consents (
 owner_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 policy_id text not null references public.membership_policies(id),
 consented_at timestamptz not null default now(),
 primary key(owner_id,request_id)
);
alter table public.memberships enable row level security;
alter table public.membership_consents enable row level security;
revoke all on public.memberships,public.membership_consents from public,anon,authenticated;
grant select on public.memberships,public.membership_consents to authenticated;
grant all on public.memberships,public.membership_consents to service_role;
create policy membership_read_own on public.memberships for select to authenticated
using(owner_id=(select auth.uid()) and (select public.personal_account_active()));
create policy membership_consents_read_own on public.membership_consents for select to authenticated
using(owner_id=(select auth.uid()) and (select public.personal_account_active()));

create function public.get_membership_policy() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'terms',terms_body,'privacy',privacy_body,'publishedAt',published_at)
 from public.membership_policies where active and published_at<=now();
$$;
revoke all on function public.get_membership_policy() from public,anon,authenticated;
grant execute on function public.get_membership_policy() to anon,authenticated;

create function public.get_membership(p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or auth.uid() is distinct from p_owner or not public.personal_account_active() then
   raise exception 'Account unavailable' using errcode='42501';
 end if;
 select jsonb_build_object('owner',owner_id,'policyId',policy_id,'completedAt',completed_at,'consentedAt',consented_at)
 into result from public.memberships where owner_id=p_owner;
 return result;
end;
$$;
revoke all on function public.get_membership(uuid) from public,anon,authenticated;
grant execute on function public.get_membership(uuid) to authenticated;

create function public.accept_membership(
 p_owner uuid,p_policy_id text,p_terms boolean,p_privacy boolean,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); policy public.membership_policies; receipt public.membership_consents;
begin
 if actor is null or actor is distinct from p_owner or not public.personal_account_active() then
   raise exception 'Account unavailable' using errcode='42501';
 end if;
 if p_terms is distinct from true or p_privacy is distinct from true or p_request_id is null or p_policy_id is null then
   raise exception 'Required consent missing' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership/'||actor::text,0));
 select * into receipt from public.membership_consents where owner_id=actor and request_id=p_request_id;
 if found then
   if receipt.policy_id is distinct from p_policy_id then
     raise exception 'Request mismatch' using errcode='22023';
   end if;
   -- Replaying an old receipt never rolls a newer consent back.
   return public.get_membership(actor);
 end if;
 select * into policy from public.membership_policies where active and published_at<=now() for share;
 if not found or policy.id is distinct from p_policy_id then
   raise exception 'Policy changed or unavailable' using errcode='22023';
 end if;
 insert into public.membership_consents(owner_id,request_id,policy_id)
 values(actor,p_request_id,p_policy_id);
 insert into public.memberships(owner_id,policy_id,completed_at,consented_at) values(actor,p_policy_id,now(),now())
 on conflict(owner_id) do update set policy_id=excluded.policy_id,
   completed_at=coalesce(public.memberships.completed_at,now()),consented_at=now();
 return public.get_membership(actor);
end;
$$;
revoke all on function public.accept_membership(uuid,text,boolean,boolean,uuid) from public,anon,authenticated;
grant execute on function public.accept_membership(uuid,text,boolean,boolean,uuid) to authenticated;

-- Existing and new Auth accounts share the same pending state. No historical
-- acceptance is invented, and no metadata, record or Storage object is changed.
create function public.initialize_membership() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.memberships(owner_id) values(new.id) on conflict(owner_id) do nothing;
 return new;
end;
$$;
revoke all on function public.initialize_membership() from public,anon,authenticated;
create trigger initialize_runpen_membership after insert on auth.users
for each row execute function public.initialize_membership();
insert into public.memberships(owner_id) select id from auth.users on conflict(owner_id) do nothing;

comment on table public.memberships is 'S1 completion only; grants no bonus, paid entitlement or access to another owner records.';
comment on table public.membership_consents is 'Versioned consent receipts, removed with Auth account. Required consent is implicit in guarded RPC acceptance.';
commit;
