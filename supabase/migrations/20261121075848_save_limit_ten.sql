-- 2026-11-21: cumulative free saves are capped at 10. Keep existing usage and
-- saved courses, including accounts already above the new limit.
begin;
alter table public.usage_policy alter column save_limit set default 10;
update public.usage_policy set save_limit = 10 where id = true and save_limit <> 10;
commit;
