-- Administrative, account-specific generation credits; no client grants or counter resets.
begin;
create table public.usage_generation_credits (
 owner_id uuid primary key references auth.users on delete cascade,
 extra_generations integer not null check(extra_generations between 0 and 1000000),
 reason text not null check(length(trim(reason)) between 1 and 200),
 updated_at timestamptz not null default now()
);
alter table public.usage_generation_credits enable row level security;
revoke all on public.usage_generation_credits from public, anon, authenticated, service_role;
-- The database administrator manages credits; SECURITY DEFINER usage_command reads them.
create or replace function public.usage_command(p_owner uuid,p_action text,p_id uuid default null,p_kind text default null,p_fingerprint text default null,p_result jsonb default null,p_course_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; policy public.usage_policy; subject public.usage_subjects; op public.usage_operations; pending bigint; used bigint; maximum integer; existing text;
begin
 select subject_id into sid from public.usage_owners where owner_id=p_owner;
 if sid is null or exists(select 1 from public.account_deletions where owner_id=p_owner) then raise exception 'account_unavailable' using errcode='42501'; end if;
 select * into subject from public.usage_subjects where id=sid for update;
 select * into policy from public.usage_policy where id for share;
 if not policy.active then raise exception 'usage_policy_unavailable'; end if;
 -- Bonus belongs to this authenticated owner only; lifetime counters are unchanged.
 policy.generation_limit:=policy.generation_limit+coalesce((select extra_generations from public.usage_generation_credits where owner_id=p_owner for share),0);
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

commit;
