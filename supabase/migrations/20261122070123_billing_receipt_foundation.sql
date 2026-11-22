-- Verification staging only: no usage/grant/policy changes and no store consumption.
begin;
create table public.billing_purchase_receipts (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 owner_id uuid references auth.users(id) on delete set null,
 account_id text not null check (account_id ~ '^[a-f0-9]{64}$'),
 product_id text not null check (product_id ~ '^[a-z0-9][a-z0-9._]{0,149}$'),
 pack_id text not null check (pack_id in ('basic','plus','expanded')),
 state text not null check (state in ('pending','verified','cancelled')),
 purchased_at timestamptz,
 order_id text check (char_length(order_id) between 1 and 256),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (state <> 'verified' or purchased_at is not null)
);
create index billing_receipts_owner_history on public.billing_purchase_receipts(owner_id,created_at desc,id desc);
alter table public.billing_purchase_receipts enable row level security;
revoke all on public.billing_purchase_receipts from public,anon,authenticated,service_role;
grant select,insert,update on public.billing_purchase_receipts to service_role;
comment on table public.billing_purchase_receipts is 'Test purchase verification only, never an allowance. Token hashes remain after owner deletion to prevent replay; deploy only after retention review. Raw tokens are not stored.';

-- Invoker rights: only the trusted service role has access, never SECURITY DEFINER.
create function public.billing_assert_eligible(p_owner uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 -- Same lock as begin_account_deletion: deletion cannot cross an accepted receipt transaction.
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('account/'||p_owner::text,0));
 perform 1 from auth.users where id=p_owner for key share;
 if not found or exists(select 1 from public.account_deletions where owner_id=p_owner) then
   raise exception 'account_unavailable' using errcode='42501';
 end if;
 if not exists(select 1 from public.memberships m join public.membership_policies p on p.id=m.policy_id
   where m.owner_id=p_owner and m.completed_at is not null and p.active and p.published_at<=now()) then
   raise exception 'membership_required' using errcode='42501';
 end if;
end;
$$;

create function public.billing_receipt_json(p_receipt public.billing_purchase_receipts) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('purchaseId',p_receipt.id,'productId',p_receipt.product_id,'packId',p_receipt.pack_id,
   'state',p_receipt.state,'purchasedAt',p_receipt.purchased_at,'orderId',p_receipt.order_id,
   'deliveryState','not_granted','testPurchase',true);
$$;

create function public.billing_record_receipt(p_owner uuid,p_token_hash text,p_account_id text,p_product_id text,
 p_pack_id text,p_state text,p_purchased_at timestamptz,p_order_id text,p_consumed boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare receipt public.billing_purchase_receipts; inserted boolean;
begin
 perform public.billing_assert_eligible(p_owner);
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_account_id is null or p_account_id !~ '^[a-f0-9]{64}$'
   or p_product_id is null or p_product_id !~ '^[a-z0-9][a-z0-9._]{0,149}$'
   or p_pack_id is null or p_pack_id not in ('basic','plus','expanded')
   or p_state is null or p_state not in ('pending','verified','cancelled') or p_consumed is null
   or (p_state='verified' and p_purchased_at is null) or (p_purchased_at is not null and not isfinite(p_purchased_at))
   or (p_order_id is not null and char_length(p_order_id) not between 1 and 256) then
   raise exception 'invalid_receipt' using errcode='22023';
 end if;
 insert into public.billing_purchase_receipts(token_hash,owner_id,account_id,product_id,pack_id,state,purchased_at,order_id)
 values(p_token_hash,p_owner,p_account_id,p_product_id,p_pack_id,p_state,p_purchased_at,p_order_id)
 on conflict(token_hash) do nothing;
 inserted:=found;
 -- Unique token plus row lock serializes retries and racing accounts, including response loss.
 select * into strict receipt from public.billing_purchase_receipts where token_hash=p_token_hash for update;
 if receipt.owner_id is distinct from p_owner or receipt.account_id<>p_account_id then
   raise exception 'purchase_owner' using errcode='42501';
 end if;
 if receipt.product_id<>p_product_id or receipt.pack_id<>p_pack_id
   or (receipt.purchased_at is not null and p_purchased_at is not null and receipt.purchased_at<>p_purchased_at)
   or (receipt.order_id is not null and p_order_id is not null and receipt.order_id<>p_order_id) then
   raise exception 'purchase_mismatch' using errcode='22023';
 end if;
 if inserted and p_consumed then raise exception 'consumed_purchase_unknown' using errcode='22023'; end if;
 -- Cancellation is terminal; a late PENDING or PURCHASED response cannot resurrect it.
 update public.billing_purchase_receipts set
   state=case when receipt.state='cancelled' or p_state='cancelled' then 'cancelled'
     when receipt.state='verified' or p_state='verified' then 'verified' else 'pending' end,
   purchased_at=coalesce(receipt.purchased_at,p_purchased_at),order_id=coalesce(receipt.order_id,p_order_id),updated_at=now()
 where id=receipt.id returning * into receipt;
 return public.billing_receipt_json(receipt);
end;
$$;

create function public.billing_purchase_history(p_owner uuid,p_cursor uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cursor_row public.billing_purchase_receipts; rows jsonb; next_cursor uuid;
begin
 perform public.billing_assert_eligible(p_owner);
 if p_cursor is not null then
   select * into cursor_row from public.billing_purchase_receipts where id=p_cursor and owner_id=p_owner;
   if not found then raise exception 'invalid_cursor' using errcode='22023'; end if;
 end if;
 with page as (
   select * from public.billing_purchase_receipts where owner_id=p_owner
     and (p_cursor is null or (created_at,id)<(cursor_row.created_at,cursor_row.id))
   order by created_at desc,id desc limit 21
 ), numbered as (select *,row_number() over(order by created_at desc,id desc) n from page)
 select coalesce(jsonb_agg(public.billing_receipt_json(r) order by r.created_at desc,r.id desc) filter(where n<=20),'[]'::jsonb),
   case when count(*)>20 then (array_agg(r.id order by r.created_at desc,r.id desc))[20] end
 into rows,next_cursor
 from numbered join public.billing_purchase_receipts r using(id);
 return jsonb_build_object('purchases',rows,'nextCursor',next_cursor);
end;
$$;

revoke all on function public.billing_assert_eligible(uuid) from public,anon,authenticated;
revoke all on function public.billing_receipt_json(public.billing_purchase_receipts) from public,anon,authenticated;
revoke all on function public.billing_record_receipt(uuid,text,text,text,text,text,timestamptz,text,boolean) from public,anon,authenticated;
revoke all on function public.billing_purchase_history(uuid,uuid) from public,anon,authenticated;
grant execute on function public.billing_assert_eligible(uuid) to service_role;
grant execute on function public.billing_receipt_json(public.billing_purchase_receipts) to service_role;
grant execute on function public.billing_record_receipt(uuid,text,text,text,text,text,timestamptz,text,boolean) to service_role;
grant execute on function public.billing_purchase_history(uuid,uuid) to service_role;
commit;
