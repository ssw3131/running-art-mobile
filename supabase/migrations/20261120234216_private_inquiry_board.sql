-- Standalone repair for hosted partial S6 deployment, and upgrade of full local S6.
-- Does not create/replace policies or notices. Legacy email argument is ignored.
begin;
create schema if not exists support_private;
revoke all on schema support_private from public, anon, authenticated;

create table if not exists public.service_inquiries (
 owner_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 category text not null check(category in ('사용 방법','오류 신고','계정·개인정보','의견·제안','기타')),
 title text not null check(char_length(title) between 1 and 100),
 body text not null check(char_length(body) between 1 and 5000),
 received_at timestamptz not null default now(),
 primary key(owner_id,request_id)
);
alter table public.service_inquiries drop column if exists contact_email;
alter table public.service_inquiries
 add column reply_body text check(reply_body is null or char_length(btrim(reply_body)) between 1 and 5000),
 add column replied_at timestamptz,
 add column reply_updated_at timestamptz,
 add column version integer not null default 1 check(version>0),
 add column status text generated always as (case when reply_body is null then '미확인' else '답변 완료' end) stored;
create index if not exists service_inquiries_page on public.service_inquiries(owner_id,received_at desc,request_id desc);
alter table public.service_inquiries enable row level security;
revoke all on public.service_inquiries from public,anon,authenticated;
grant select on public.service_inquiries to authenticated;
grant all on public.service_inquiries to service_role;
drop policy if exists inquiry_read_own on public.service_inquiries;
create policy inquiry_read_own on public.service_inquiries for select to authenticated
 using(owner_id=(select auth.uid()) and (select public.personal_account_active()));

create table support_private.inquiry_requests (
 owner_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 input_hash bytea not null,
 received_at timestamptz not null,
 primary key(owner_id,request_id)
);
alter table support_private.inquiry_requests enable row level security;
revoke all on support_private.inquiry_requests from public,anon,authenticated;
create index inquiry_requests_rate on support_private.inquiry_requests(owner_id,received_at);

create function support_private.input_hash(category text,title text,body text) returns bytea
language sql immutable set search_path='' as $$
 select pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(category,title,body)::text,'UTF8'));
$$;
create function support_private.validate_input(category text,title text,body text) returns void
language plpgsql set search_path='' as $$
begin
 if category is null or category not in ('사용 방법','오류 신고','계정·개인정보','의견·제안','기타')
  or title is null or char_length(title) not between 1 and 100 or title ~ '[[:cntrl:]]'
  or body is null or char_length(body) not between 1 and 5000
  or body ~ E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' then
  raise exception 'Invalid inquiry' using errcode='22023';
 end if;
end;
$$;
insert into support_private.inquiry_requests(owner_id,request_id,input_hash,received_at)
 select owner_id,request_id,support_private.input_hash(category,title,body),received_at from public.service_inquiries;

create function support_private.guard_inquiry() returns trigger
language plpgsql set search_path='' as $$
begin
 new.reply_body:=nullif(btrim(new.reply_body),'');
 if tg_op='UPDATE' then
  if (new.owner_id,new.request_id,new.received_at) is distinct from (old.owner_id,old.request_id,old.received_at) then
   raise exception 'Immutable inquiry identity' using errcode='22023';
  end if;
  if old.reply_body is not null and new.reply_body is null then
   raise exception 'Cannot clear a published reply' using errcode='22023';
  end if;
  if (old.reply_body is not null or new.reply_body is not null) and
   (new.category,new.title,new.body) is distinct from (old.category,old.title,old.body) then
   raise exception 'Inquiry answered' using errcode='40001';
  end if;
  new.version:=old.version;
  new.replied_at:=old.replied_at;
  new.reply_updated_at:=old.reply_updated_at;
  if (new.category,new.title,new.body,new.reply_body) is distinct from (old.category,old.title,old.body,old.reply_body) then
   new.version:=old.version+1;
  end if;
  if new.reply_body is distinct from old.reply_body then
   new.replied_at:=coalesce(old.replied_at,clock_timestamp());
   new.reply_updated_at:=clock_timestamp();
   if old.reply_body is null then new.reply_updated_at:=new.replied_at; end if;
  end if;
 else
  new.version:=1;
  new.replied_at:=case when new.reply_body is not null then clock_timestamp() end;
  new.reply_updated_at:=new.replied_at;
 end if;
 return new;
end;
$$;
create trigger service_inquiry_guard before insert or update on public.service_inquiries
 for each row execute function support_private.guard_inquiry();
revoke all on all functions in schema support_private from public,anon,authenticated;

create or replace function public.submit_service_inquiry(p_owner uuid,p_request_id uuid,p_category text,p_title text,p_body text,p_email text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); receipt support_private.inquiry_requests; fingerprint bytea;
begin
 if actor is null or actor is distinct from p_owner or not public.personal_account_active() then
  raise exception 'Account unavailable' using errcode='42501';
 end if;
 if p_request_id is null then raise exception 'Invalid inquiry' using errcode='22023'; end if;
 p_title:=btrim(normalize(p_title,NFC)); p_body:=btrim(normalize(p_body,NFC));
 perform support_private.validate_input(p_category,p_title,p_body);
 fingerprint:=support_private.input_hash(p_category,p_title,p_body);
 perform pg_advisory_xact_lock(hashtextextended(actor::text,56));
 select * into receipt from support_private.inquiry_requests where owner_id=actor and request_id=p_request_id;
 if found then
  if receipt.input_hash is distinct from fingerprint then
   raise exception 'Request content changed' using errcode='22023';
  end if;
 else
  if (select count(*) from support_private.inquiry_requests where owner_id=actor and received_at>now()-interval '1 hour')>=5 then
   raise exception 'Inquiry rate limit' using errcode='P0001';
  end if;
  insert into support_private.inquiry_requests values(actor,p_request_id,fingerprint,clock_timestamp()) returning * into receipt;
  insert into public.service_inquiries(owner_id,request_id,category,title,body,received_at)
   values(actor,p_request_id,p_category,p_title,p_body,receipt.received_at);
 end if;
 return jsonb_build_object('id',receipt.request_id,'receivedAt',receipt.received_at,
  'deleted',not exists(select 1 from public.service_inquiries where owner_id=actor and request_id=p_request_id));
end;
$$;

create function public.list_service_inquiries(p_before_at timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.personal_account_active() then raise exception 'Account unavailable' using errcode='42501'; end if;
 if (p_before_at is null) <> (p_before_id is null) then raise exception 'Invalid cursor' using errcode='22023'; end if;
 with candidates as (
  select * from public.service_inquiries where owner_id=(select auth.uid())
   and (p_before_at is null or (received_at,request_id)<(p_before_at,p_before_id))
  order by received_at desc,request_id desc limit 21
 ), page as (select * from candidates order by received_at desc,request_id desc limit 20)
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',request_id,'category',category,'title',title,'receivedAt',received_at,'answered',reply_body is not null) order by received_at desc,request_id desc) from page),'[]'::jsonb),
  'next',case when (select count(*) from candidates)>20 then (select jsonb_build_object('receivedAt',received_at,'id',request_id) from page order by received_at,request_id limit 1) else null end
 ) into result;
 return result;
end;
$$;
create function public.get_service_inquiry(p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row public.service_inquiries;
begin
 if auth.uid() is null or not public.personal_account_active() then raise exception 'Account unavailable' using errcode='42501'; end if;
 select * into row from public.service_inquiries where owner_id=(select auth.uid()) and request_id=p_request_id;
 if not found then raise exception 'Inquiry missing' using errcode='P0002'; end if;
 return jsonb_build_object('id',row.request_id,'category',row.category,'title',row.title,'body',row.body,'receivedAt',row.received_at,
  'version',row.version,'reply',row.reply_body,'repliedAt',row.replied_at,'replyUpdatedAt',row.reply_updated_at);
end;
$$;
create function public.update_service_inquiry(p_request_id uuid,p_version integer,p_category text,p_title text,p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); row public.service_inquiries;
begin
 if actor is null or not public.personal_account_active() then raise exception 'Account unavailable' using errcode='42501'; end if;
 p_title:=btrim(normalize(p_title,NFC)); p_body:=btrim(normalize(p_body,NFC));
 perform support_private.validate_input(p_category,p_title,p_body);
 select * into row from public.service_inquiries where owner_id=actor and request_id=p_request_id for update;
 if not found then raise exception 'Inquiry missing' using errcode='P0002'; end if;
 if row.reply_body is not null then raise exception 'Inquiry answered' using errcode='40001'; end if;
 if row.version is distinct from p_version then raise exception 'Inquiry changed' using errcode='40001'; end if;
 update public.service_inquiries set category=p_category,title=p_title,body=p_body where owner_id=actor and request_id=p_request_id;
end;
$$;
create function public.delete_service_inquiry(p_request_id uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); row public.service_inquiries;
begin
 if actor is null or not public.personal_account_active() then raise exception 'Account unavailable' using errcode='42501'; end if;
 select * into row from public.service_inquiries where owner_id=actor and request_id=p_request_id for update;
 if not found then return; end if; -- Lost delete response: repeating is safe.
 if row.reply_body is not null then raise exception 'Inquiry answered' using errcode='40001'; end if;
 if row.version is distinct from p_version then raise exception 'Inquiry changed' using errcode='40001'; end if;
 delete from public.service_inquiries where owner_id=actor and request_id=p_request_id;
end;
$$;
revoke all on function public.submit_service_inquiry(uuid,uuid,text,text,text,text),
 public.list_service_inquiries(timestamptz,uuid),public.get_service_inquiry(uuid),
 public.update_service_inquiry(uuid,integer,text,text,text),public.delete_service_inquiry(uuid,integer) from public,anon,authenticated;
grant execute on function public.submit_service_inquiry(uuid,uuid,text,text,text,text),
 public.list_service_inquiries(timestamptz,uuid),public.get_service_inquiry(uuid),
 public.update_service_inquiry(uuid,integer,text,text,text),public.delete_service_inquiry(uuid,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
