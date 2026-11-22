import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createBillingHandler } from '../supabase/functions/_shared/billing-handler.ts';
import { billingAccountId } from '../supabase/functions/_shared/billing-model.ts';
import { parsePurchaseHistory, parsePurchaseReceipt } from '../src/modules/packs/purchases.ts';

test('billing database: idempotency, ownership, terminal cancellation, history, deletion and role permissions', {timeout:60000},async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    grant usage on schema auth to service_role; grant select,update on auth.users to service_role;
    create table account_deletions(owner_id uuid primary key);
    create table memberships(owner_id uuid,policy_id text,completed_at timestamptz);
    create table membership_policies(id text primary key,active boolean,published_at timestamptz);
    grant select on account_deletions,memberships,membership_policies to service_role;
    insert into membership_policies values('test',true,now());
    create table usage_sentinel(id int,used int,total int);insert into usage_sentinel values(1,4,5);`);
  await db.exec(readFileSync('supabase/migrations/20261122070123_billing_receipt_foundation.sql','utf8'));
  const owner=randomUUID(), other=randomUUID(), notMember=randomUUID(), hash=n=>n.toString(16).padStart(64,'0');
  for(const id of [owner,other,notMember]) await db.query('insert into auth.users values($1)',[id]);
  for(const id of [owner,other]) await db.query("insert into memberships values($1,'test',now())",[id]);
  const eligible=async id=>{await db.query('select billing_assert_eligible($1)',[id]);};
  const record=async(id,r)=> (await db.query('select billing_record_receipt($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [id,r.tokenHash,r.accountId,r.productId,r.packId,r.state,r.purchasedAt,r.orderId,r.consumed])).rows[0].value;
  const history=async(id,cursor=null)=>(await db.query('select billing_purchase_history($1,$2) value',[id,cursor])).rows[0].value;
  const receipt={tokenHash:hash(1),accountId:hash(100),productId:'qa_basic',packId:'basic',state:'pending',purchasedAt:null,orderId:null,consumed:false};
  await db.exec('set role service_role');
  const first=await record(owner,receipt);
  assert.equal(first.state,'pending');assert.equal(first.deliveryState,'not_granted');
  const duplicates=await Promise.all(Array.from({length:10},()=>record(owner,receipt)));
  assert.ok(duplicates.every(row=>row.purchaseId===first.purchaseId));
  assert.equal((await history(owner)).purchases.length,1);
  await assert.rejects(record(other,receipt),/purchase_owner/);
  await assert.rejects(record(owner,{...receipt,accountId:hash(101)}),/purchase_owner/);
  await assert.rejects(record(owner,{...receipt,productId:'qa_plus'}),/purchase_mismatch/);
  await assert.rejects(record(notMember,{...receipt,tokenHash:hash(2)}),/membership_required/);
  await assert.rejects(record(owner,{...receipt,tokenHash:hash(3),consumed:true}),/consumed_purchase_unknown/);
  assert.equal((await history(owner)).purchases.length,1); // failed new insertion rolled back
  const purchased={...receipt,state:'verified',purchasedAt:'2026-11-22T01:00:00Z'};
  assert.equal(parsePurchaseReceipt(await record(owner,purchased)).state,'verified');
  assert.equal((await record(owner,receipt)).state,'verified'); // late PENDING
  assert.equal((await record(owner,{...purchased,consumed:true})).purchaseId,first.purchaseId);
  await assert.rejects(record(owner,{...purchased,purchasedAt:'2026-11-23T01:00:00Z'}),/purchase_mismatch/);
  const withOrder=await record(owner,{...purchased,orderId:'test-order'});assert.equal(withOrder.orderId,'test-order');
  await assert.rejects(record(owner,{...purchased,orderId:'different'}),/purchase_mismatch/);
  const cancelled=await record(owner,{...receipt,state:'cancelled'});assert.equal(cancelled.state,'cancelled');
  assert.equal((await record(owner,purchased)).state,'cancelled');
  for(let n=4;n<28;n++) await record(owner,{...receipt,tokenHash:hash(n)});
  const page1=parsePurchaseHistory(await history(owner));assert.equal(page1.purchases.length,20);assert.ok(page1.nextCursor);
  // Inserts between pages don't duplicate older results because cursor uses immutable creation order.
  const fresh=await record(owner,{...receipt,tokenHash:hash(28)});
  const page2=parsePurchaseHistory(await history(owner,page1.nextCursor));assert.equal(page2.purchases.length,5);assert.equal(page2.nextCursor,null);
  assert.equal(new Set([...page1.purchases,...page2.purchases].map(r=>r.purchaseId)).size,25);
  assert.equal(page2.purchases.some(r=>r.purchaseId===fresh.purchaseId),false);
  assert.deepEqual(await history(other),{purchases:[],nextCursor:null});
  await assert.rejects(history(other,first.purchaseId),/invalid_cursor/);
  assert.equal(JSON.stringify(await history(owner)).includes('tokenHash'),false);
  assert.equal(JSON.stringify(await history(owner)).includes('accountId'),false);
  // Full authenticated handler -> verified Google fixture -> real SQL -> client parser roundtrip.
  const secret='isolated-test-secret-not-for-use!!', accountId=await billingAccountId(other,secret);
  const handler=createBillingHandler({mode:'verify-test-only',accountKey:secret,testOwners:[other],products:[{productId:'qa_basic',packId:'basic'}],
    backend:{authenticate:async()=>other,assertEligible:eligible,record,history},readGoogle:async()=>({
      testPurchaseContext:{fopType:'TEST'},regionCode:'KR',obfuscatedExternalAccountId:accountId,purchaseStateContext:{purchaseState:'PURCHASED'},
      purchaseCompletionTime:'2026-11-22T02:00:00Z',productLineItem:[{productId:'qa_basic',productOfferDetails:{quantity:1,consumptionState:'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}]})});
  const request=()=>new Request('https://isolated.invalid',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer isolated'},body:JSON.stringify({action:'verify',purchaseToken:'roundtrip'})});
  const one=parsePurchaseReceipt(await (await handler(request())).json()),two=parsePurchaseReceipt(await (await handler(request())).json());
  assert.equal(one.purchaseId,two.purchaseId);assert.equal(one.deliveryState,'not_granted');
  await db.exec('reset role');
  for(const role of ['anon','authenticated']) {
    await db.exec('set role '+role);
    await assert.rejects(db.query('select * from billing_purchase_receipts'));
    await assert.rejects(history(owner));await assert.rejects(record(owner,receipt));await assert.rejects(eligible(owner));
    await assert.rejects(db.query("update billing_purchase_receipts set state='verified'"));
    await db.exec('reset role');
  }
  await db.query('insert into account_deletions values($1)',[owner]);
  await db.exec('set role service_role');await assert.rejects(history(owner),/account_unavailable/);await assert.rejects(record(owner,purchased),/account_unavailable/);
  await db.exec('reset role');await db.query('delete from auth.users where id=$1',[owner]);
  assert.equal((await db.query('select owner_id from billing_purchase_receipts where id=$1',[first.purchaseId])).rows[0].owner_id,null);
  await db.exec('set role service_role');await assert.rejects(record(other,receipt),/purchase_owner/);
  await db.exec('reset role');
  assert.deepEqual((await db.query('select * from usage_sentinel')).rows,[{id:1,used:4,total:5}]);
  assert.equal((await db.query("select count(*)::int n from pg_proc where proname like 'billing_%' and prosecdef")).rows[0].n,0);
});
