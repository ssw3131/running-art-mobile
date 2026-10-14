-- S6: managed notices and authenticated, idempotent inquiry receipts.
-- No example announcements, legal text or operator identity is published here.
begin;
create table public.service_policies (
 id text primary key check(id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'),
 kind text not null check(kind in ('privacy','location')),
 body text not null check(char_length(btrim(body)) between 1 and 100000),
 effective_at timestamptz not null,
 published boolean not null default false
);
alter table public.service_policies enable row level security;
revoke all on public.service_policies from public,anon,authenticated;
grant all on public.service_policies to service_role;
create function public.get_service_policy(p_kind text) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when p_kind='terms' then (
  select jsonb_build_object('id',id,'body',terms_body,'effectiveAt',published_at)
  from public.membership_policies where active and published_at<=now()
 ) else (
  select jsonb_build_object('id',id,'body',body,'effectiveAt',effective_at)
  from public.service_policies where kind=p_kind and published and effective_at<=now()
  order by effective_at desc,id desc limit 1
 ) end;
$$;
revoke all on function public.get_service_policy(text) from public,anon,authenticated;
grant execute on function public.get_service_policy(text) to anon,authenticated;
create table public.service_notices (
 id text primary key check(id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'),
 title text not null check(char_length(btrim(title)) between 1 and 150),
 body text not null check(char_length(btrim(body)) between 1 and 30000),
 category text not null check(char_length(btrim(category)) between 1 and 30),
 published_at timestamptz not null default now(),
 published boolean not null default false
);
alter table public.service_notices enable row level security;
revoke all on public.service_notices from public,anon,authenticated;
grant all on public.service_notices to service_role;
create function public.get_service_notices() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'body',body,'category',category,'publishedAt',published_at) order by published_at desc,id), '[]'::jsonb)
 from (select * from public.service_notices where published and published_at<=now() order by published_at desc,id limit 100) n;
$$;
revoke all on function public.get_service_notices() from public,anon,authenticated;
grant execute on function public.get_service_notices() to anon,authenticated;

create table public.service_inquiries (
 owner_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 category text not null check(category in ('사용 방법','오류 신고','계정·개인정보','의견·제안','기타')),
 title text not null check(char_length(title) between 1 and 100),
 body text not null check(char_length(body) between 1 and 5000),
 contact_email text not null default '' check(char_length(contact_email)<=254),
 received_at timestamptz not null default now(),
 primary key(owner_id,request_id)
);
create index service_inquiries_received on public.service_inquiries(owner_id,received_at);
alter table public.service_inquiries enable row level security;
revoke all on public.service_inquiries from public,anon,authenticated;
grant select on public.service_inquiries to authenticated;
grant all on public.service_inquiries to service_role;
create policy inquiry_read_own on public.service_inquiries for select to authenticated
 using(owner_id=(select auth.uid()) and (select public.personal_account_active()));

create function public.submit_service_inquiry(p_owner uuid,p_request_id uuid,p_category text,p_title text,p_body text,p_email text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); receipt public.service_inquiries;
begin
 if actor is null or actor is distinct from p_owner or not public.personal_account_active() then
  raise exception 'Account unavailable' using errcode='42501';
 end if;
 if p_request_id is null or p_category is null or p_title is null or p_body is null or p_email is null then
  raise exception 'Invalid inquiry' using errcode='22023';
 end if;
 p_title:=btrim(p_title); p_body:=btrim(p_body); p_email:=btrim(p_email);
 if p_category not in ('사용 방법','오류 신고','계정·개인정보','의견·제안','기타')
  or char_length(p_title) not between 1 and 100 or p_title ~ '[[:cntrl:]]'
  or char_length(p_body) not between 1 and 5000
  or char_length(p_email)>254 or (p_email<>'' and p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
  raise exception 'Invalid inquiry' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,56));
 select * into receipt from public.service_inquiries where owner_id=actor and request_id=p_request_id;
 if found then
  if receipt.category is distinct from p_category or receipt.title is distinct from p_title or receipt.body is distinct from p_body or receipt.contact_email is distinct from p_email then
   raise exception 'Request content changed' using errcode='22023';
  end if;
 else
  if (select count(*) from public.service_inquiries where owner_id=actor and received_at>now()-interval '1 hour')>=5 then
   raise exception 'Inquiry rate limit' using errcode='P0001';
  end if;
  insert into public.service_inquiries(owner_id,request_id,category,title,body,contact_email)
   values(actor,p_request_id,p_category,p_title,p_body,p_email) returning * into receipt;
 end if;
 return jsonb_build_object('id',receipt.request_id,'receivedAt',receipt.received_at);
end;
$$;
revoke all on function public.submit_service_inquiry(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_service_inquiry(uuid,uuid,text,text,text,text) to authenticated;
commit;
