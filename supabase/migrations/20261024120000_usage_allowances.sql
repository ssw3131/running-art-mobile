-- Free usage is cumulative, independent of optional personal-record sync.
begin;
create table public.usage_policy (
 id boolean primary key default true check(id), version bigint not null default 1,
 generation_limit integer not null default 5 check(generation_limit between 0 and 1000000),
 save_limit integer not null default 15 check(save_limit between 0 and 1000000),
 active boolean not null default true, updated_at timestamptz not null default now()
);
insert into public.usage_policy(id) values(true);
create table public.usage_policy_history (version bigint primary key, policy jsonb not null, changed_at timestamptz not null default now());
insert into public.usage_policy_history select version,to_jsonb(p),now() from public.usage_policy p;
create function public.audit_usage_policy() returns trigger language plpgsql set search_path='' as $$
begin
 new.version:=old.version+1; new.updated_at:=now();
 insert into public.usage_policy_history(version,policy) values(new.version,to_jsonb(new)); return new;
end; $$;
create trigger usage_policy_audit before update on public.usage_policy for each row execute function public.audit_usage_policy();
create table public.usage_subjects (
 id uuid primary key default gen_random_uuid(), generation_used bigint not null default 0 check(generation_used>=0),
 save_used bigint not null default 0 check(save_used>=0)
);
-- Only keyed provider identifiers and counters survive deletion. Never store email/raw provider ID here.
create table public.usage_identities (identity_hash text primary key check(identity_hash ~ '^[a-f0-9]{64}$'), subject_id uuid not null references public.usage_subjects on delete cascade);
create table public.usage_owners (owner_id uuid primary key references auth.users on delete cascade, subject_id uuid not null references public.usage_subjects);
create table public.usage_operations (
 id uuid primary key, owner_id uuid not null references auth.users on delete cascade,
 subject_id uuid not null references public.usage_subjects, kind text not null check(kind in ('generation','save')),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 state text not null check(state in ('reserved','ready','committed','cancelled')),
 result jsonb, expires_at timestamptz not null default now()+interval '10 minutes', created_at timestamptz not null default now()
);
create index usage_operations_subject on public.usage_operations(subject_id,kind,state);
-- Save instances are separate from route hashes: deletion followed by saving is a new use.
create table public.usage_saved_courses (
 subject_id uuid not null references public.usage_subjects, owner_id uuid not null references auth.users on delete cascade,
 snapshot_hash text not null check(snapshot_hash ~ '^[a-f0-9]{64}$'), course_id text not null check(course_id ~ '^[a-f0-9]{32}$'),
 operation_id uuid references public.usage_operations, deleted boolean not null default false,
 primary key(subject_id,course_id)
);
create unique index usage_saved_active_hash on public.usage_saved_courses(subject_id,snapshot_hash) where not deleted;

create function public.bind_usage_subject(p_owner uuid,p_hashes text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid; other uuid; h text;
begin
 if p_hashes is null or not exists(select 1 from auth.users where id=p_owner) or cardinality(p_hashes) not between 1 and 20
   or exists(select 1 from unnest(p_hashes) v where v is null or v !~ '^[a-f0-9]{64}$') then raise exception 'invalid_identity'; end if;
 -- Binding and linked-provider merges share one short global lock; usage locks remain per subject.
 perform pg_advisory_xact_lock(hashtextextended('usage/identities',0));
 select subject_id into sid from public.usage_owners where owner_id=p_owner;
 if sid is null then select subject_id into sid from public.usage_identities where identity_hash=any(p_hashes) order by identity_hash limit 1; end if;
 if sid is null then insert into public.usage_subjects default values returning id into sid; end if;
 perform 1 from public.usage_subjects where id=sid for update;
 for other in select distinct subject_id from public.usage_identities where identity_hash=any(p_hashes) and subject_id<>sid loop
   perform 1 from public.usage_subjects where id=other for update;
   update public.usage_subjects s set generation_used=s.generation_used+o.generation_used,save_used=s.save_used+o.save_used from public.usage_subjects o where s.id=sid and o.id=other;
   -- Historical counts combine; no new allowance is issued by linking identities.
   update public.usage_saved_courses set deleted=true where subject_id=other and not deleted and snapshot_hash in(select snapshot_hash from public.usage_saved_courses where subject_id=sid and not deleted);
   delete from public.usage_saved_courses where subject_id=other and course_id in(select course_id from public.usage_saved_courses where subject_id=sid);
   update public.usage_saved_courses set subject_id=sid where subject_id=other;
   update public.usage_operations set subject_id=sid where subject_id=other;
   update public.usage_owners set subject_id=sid where subject_id=other;
   update public.usage_identities set subject_id=sid where subject_id=other;
   delete from public.usage_subjects where id=other;
 end loop;
 foreach h in array p_hashes loop insert into public.usage_identities values(h,sid) on conflict(identity_hash) do nothing; end loop;
 insert into public.usage_owners values(p_owner,sid) on conflict(owner_id) do update set subject_id=excluded.subject_id;
 return sid;
end; $$;

create function public.usage_command(p_owner uuid,p_action text,p_id uuid default null,p_kind text default null,p_fingerprint text default null,p_result jsonb default null,p_course_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; policy public.usage_policy; subject public.usage_subjects; op public.usage_operations; pending bigint; used bigint; maximum integer; existing text;
begin
 select subject_id into sid from public.usage_owners where owner_id=p_owner;
 if sid is null or exists(select 1 from public.account_deletions where owner_id=p_owner) then raise exception 'account_unavailable' using errcode='42501'; end if;
 select * into subject from public.usage_subjects where id=sid for update;
 select * into policy from public.usage_policy where id for share;
 if not policy.active then raise exception 'usage_policy_unavailable'; end if;
 if not exists(select 1 from public.memberships m join public.membership_policies p on p.id=m.policy_id where m.owner_id=p_owner and m.completed_at is not null and p.active and p.published_at<=now()) then raise exception 'membership_required' using errcode='42501'; end if;
 update public.usage_operations set state='cancelled',result=null where subject_id=sid and state in('reserved','ready') and expires_at<=now();
 if p_action='status' then
   return jsonb_build_object('version',policy.version,'generation',jsonb_build_object('used',subject.generation_used,'total',policy.generation_limit,'available',subject.generation_used<policy.generation_limit),'save',jsonb_build_object('used',subject.save_used,'total',policy.save_limit,'available',subject.save_used<policy.save_limit));
 end if;
 if p_action='delete_course' then
   update public.usage_saved_courses set deleted=true where subject_id=sid and course_id=p_course_id;
   return jsonb_build_object('state','deleted');
 end if;
 if p_id is null then raise exception 'invalid_operation'; end if;
 select * into op from public.usage_operations where id=p_id;
 if found and (op.subject_id<>sid or op.owner_id<>p_owner) then raise exception 'operation_owner' using errcode='42501'; end if;
 if p_action='read' then
   if op.id is null then return 'null'::jsonb; end if;
   return to_jsonb(op)||jsonb_build_object('courseId',coalesce(op.result->>'courseId',(select course_id from public.usage_saved_courses where operation_id=op.id)));
 end if;
 if p_action='reserve' then
   if p_kind not in('generation','save') or p_kind is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid_operation'; end if;
   if op.id is not null then
     if op.kind<>p_kind or op.fingerprint<>p_fingerprint then raise exception 'operation_mismatch'; end if;
     return to_jsonb(op)||jsonb_build_object('courseId',coalesce(op.result->>'courseId',(select course_id from public.usage_saved_courses where operation_id=op.id)));
   end if;
   if p_kind='save' then
     select course_id into existing from public.usage_saved_courses where subject_id=sid and snapshot_hash=p_fingerprint and not deleted;
     if existing is not null then return jsonb_build_object('state','existing','courseId',existing); end if;
   end if;
   select count(*) into pending from public.usage_operations where subject_id=sid and kind=p_kind and state in('reserved','ready');
   used:=case when p_kind='generation' then subject.generation_used else subject.save_used end;
   maximum:=case when p_kind='generation' then policy.generation_limit else policy.save_limit end;
   if used+pending>=maximum then return jsonb_build_object('state','exhausted'); end if;
   insert into public.usage_operations(id,owner_id,subject_id,kind,fingerprint,state) values(p_id,p_owner,sid,p_kind,p_fingerprint,'reserved') returning * into op;
 elsif p_action='ready' then
   if op.id is null or op.kind<>'generation' then raise exception 'invalid_operation'; end if;
   if op.state='reserved' then
     if p_result is null or jsonb_typeof(p_result->'result'->'candidates') is distinct from 'array' or jsonb_array_length(p_result->'result'->'candidates')=0 then raise exception 'empty_result'; end if;
     update public.usage_operations set state='ready',result=p_result where id=p_id returning * into op;
   end if;
 elsif p_action='commit' then
   if op.id is null then raise exception 'invalid_operation'; end if;
   if (op.kind='generation' and op.state='ready') or (op.kind='save' and op.state='reserved') then
     used:=case when op.kind='generation' then subject.generation_used else subject.save_used end;
     maximum:=case when op.kind='generation' then policy.generation_limit else policy.save_limit end;
     if used>=maximum then return jsonb_build_object('state','exhausted'); end if;
     if op.kind='save' then
       if p_course_id is null or p_course_id !~ '^[a-f0-9]{32}$' then raise exception 'invalid_course'; end if;
       select course_id into existing from public.usage_saved_courses where subject_id=sid and snapshot_hash=op.fingerprint and not deleted;
       if existing is not null then
         update public.usage_operations set state='committed',result=jsonb_build_object('courseId',existing) where id=p_id;
         return jsonb_build_object('state','existing','courseId',existing);
       end if;
       insert into public.usage_saved_courses values(sid,p_owner,op.fingerprint,p_course_id,p_id,false);
     end if;
     update public.usage_subjects set generation_used=generation_used+case when op.kind='generation' then 1 else 0 end,save_used=save_used+case when op.kind='save' then 1 else 0 end where id=sid;
     update public.usage_operations set state='committed',result=case when kind='save' then jsonb_build_object('courseId',p_course_id) else result end,expires_at=now()+interval '24 hours' where id=p_id returning * into op;
   end if;
 elsif p_action='cancel' then
   if op.id is not null and op.state in('reserved','ready') then update public.usage_operations set state='cancelled',result=null where id=p_id returning * into op; end if;
 else raise exception 'invalid_action';
 end if;
 if op.id is null then return 'null'::jsonb; end if;
 return to_jsonb(op)||jsonb_build_object('courseId',coalesce(op.result->>'courseId',(select course_id from public.usage_saved_courses where operation_id=op.id)));
end; $$;

create function public.seal_usage_on_deletion() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 select subject_id into sid from public.usage_owners where owner_id=new.owner_id;
 if sid is not null then
   perform 1 from public.usage_subjects where id=sid for update;
   update public.usage_operations set state='cancelled',result=null where owner_id=new.owner_id and state in('reserved','ready');
 end if;
 return new;
end; $$;
create trigger usage_deletion_seal after insert on public.account_deletions for each row execute function public.seal_usage_on_deletion();

-- No client can forge identity bindings, successful calculations, or directly change counters.
do $$ declare t text; begin
 foreach t in array array['usage_policy','usage_policy_history','usage_subjects','usage_identities','usage_owners','usage_operations','usage_saved_courses'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
revoke all on function public.bind_usage_subject(uuid,text[]),public.usage_command(uuid,text,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.bind_usage_subject(uuid,text[]),public.usage_command(uuid,text,uuid,text,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
