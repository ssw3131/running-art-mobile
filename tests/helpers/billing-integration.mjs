import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isolatedSupabase } from '../../scripts/qa/isolated-supabase.mjs';
import { createMembershipRemote } from '../../src/modules/membership/remote.ts';
import { createBillingBackend } from '../../supabase/functions/_shared/billing-backend.ts';
import { billingAccountId, purchaseTokenHash } from '../../supabase/functions/_shared/billing-model.ts';
import { parsePurchaseHistory } from '../../src/modules/packs/purchases.ts';

export async function billingIntegration(t) {
  const {admin,client:createClient,env}=isolatedSupabase(), users=[],clients=[];
  const policyId=`billing-qa-${randomUUID()}`;
  t.after(async()=>{
    for(const client of clients) await client.auth.signOut();
    for(const id of users) assert.equal((await admin.auth.admin.deleteUser(id)).error,null);
    assert.equal((await admin.from('membership_policies').delete().eq('id',policyId)).error,null);
    // Token tombstones intentionally remain in this disposable stack, destroyed after CI.
  });
  assert.equal((await admin.from('membership_policies').insert({id:policyId,terms_body:'Isolated QA only',privacy_body:'Synthetic receipts only',active:true})).error,null);
  for(let i=0;i<2;i++) {
    const email=`qa-billing-${randomUUID()}@example.invalid`, password=randomUUID()+'Aa!9';
    const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(error,null);users.push(data.user.id);
    const client=createClient();assert.equal((await client.auth.signInWithPassword({email,password})).error,null);clients.push(client);
    await createMembershipRemote(client).accept({owner:data.user.id,policyId,terms:true,privacy:true,requestId:randomUUID()});
  }
  // Only the disposable loopback stack is permitted above. Record SQL diagnostics,
  // never HTTP credentials or request bodies, without changing production errors.
  const backend=createBillingBackend({url:env.API_URL,serviceKey:env.SERVICE_ROLE_KEY},async(input,init)=>{
    const response=await fetch(input,init);
    if(!response.ok){
      const problem=await response.clone().json().catch(()=>({}));
      const message=String(problem.message??'').replace(/[a-f0-9]{8}-[a-f0-9-]{27,}|[a-f0-9]{64}/gi,'[id]').slice(0,200);
      t.diagnostic(JSON.stringify({status:response.status,code:problem.code,message}));
    }
    return response;
  });
  const session=(await clients[0].auth.getSession()).data.session;
  assert.equal(await backend.authenticate(session.access_token),users[0]);
  const receipt={tokenHash:await purchaseTokenHash(randomUUID()),accountId:await billingAccountId(users[0],'isolated-billing-integration-key!!'),
    productId:'qa_basic',packId:'basic',state:'verified',purchasedAt:'2026-11-22T01:00:00Z',orderId:null,consumed:false};
  const before=(await admin.from('usage_subjects').select('*').order('id')).data;
  const attempts=await Promise.allSettled(Array.from({length:12},()=>backend.record(users[0],receipt)));
  assert.ok(attempts.every(result=>result.status==='fulfilled'),'All simultaneous receipts must complete successfully');
  const results=attempts.map(result=>result.value);
  assert.equal(new Set(results.map(row=>row.purchaseId)).size,1);
  assert.ok(results.every(row=>row.deliveryState==='not_granted'));
  await assert.rejects(backend.record(users[1],receipt),{code:'purchase_owner'});
  assert.ok((await clients[0].rpc('billing_record_receipt',{
    p_owner:users[0],p_token_hash:receipt.tokenHash,p_account_id:receipt.accountId,p_product_id:'qa_basic',p_pack_id:'basic',
    p_state:'verified',p_purchased_at:receipt.purchasedAt,p_order_id:null,p_consumed:false})).error);
  assert.ok((await clients[0].from('billing_purchase_receipts').select('*')).error);
  const page=parsePurchaseHistory(await backend.history(users[0],null));assert.equal(page.purchases.length,1);
  assert.deepEqual(await backend.history(users[1],null),{purchases:[],nextCursor:null});
  await Promise.all([backend.record(users[0],{...receipt,state:'cancelled'}),backend.record(users[0],receipt),backend.record(users[0],{...receipt,state:'pending',purchasedAt:null})]);
  assert.equal((await backend.history(users[0],null)).purchases[0].state,'cancelled');
  const deletion=await Promise.allSettled([admin.rpc('begin_account_deletion',{p_owner:users[0]}),backend.record(users[0],receipt)]);
  assert.equal(deletion[0].status,'fulfilled');assert.equal(deletion[0].value.error,null);
  await assert.rejects(backend.record(users[0],receipt),{code:'account_unavailable'});
  await assert.rejects(backend.history(users[0],null),{code:'account_unavailable'});
  const removed=users.shift();assert.equal((await admin.auth.admin.deleteUser(removed)).error,null);
  assert.equal((await admin.from('billing_purchase_receipts').select('owner_id').eq('id',results[0].purchaseId).single()).data.owner_id,null);
  await assert.rejects(backend.record(users[0],receipt),{code:'purchase_owner'});
  // Direct Auth administration can bypass the app deletion marker. FK and receipt
  // row locks must still leave only tombstones, never an orphan/reassigned receipt.
  const directOwner=users[0], directReceipt={...receipt,tokenHash:await purchaseTokenHash(randomUUID()),
    accountId:await billingAccountId(directOwner,'isolated-billing-integration-key!!')};
  const direct=await backend.record(directOwner,directReceipt);
  const directRace=await Promise.allSettled([admin.auth.admin.deleteUser(directOwner),
    ...Array.from({length:12},()=>backend.record(directOwner,directReceipt))]);
  assert.equal(directRace[0].status,'fulfilled');assert.equal(directRace[0].value.error,null);users.shift();
  for(const result of directRace.slice(1)) {
    if(result.status==='fulfilled') assert.equal(result.value.purchaseId,direct.purchaseId);
    else assert.ok(['membership_required','purchase_owner'].includes(result.reason.code),'Only the deletion boundary may reject racing receipts');
  }
  assert.equal((await admin.from('billing_purchase_receipts').select('owner_id').eq('id',direct.purchaseId).single()).data.owner_id,null);
  await assert.rejects(backend.history(directOwner,null),{code:'membership_required'});
  await assert.rejects(backend.record(directOwner,directReceipt),{code:'membership_required'});
  assert.deepEqual((await admin.from('usage_subjects').select('*').order('id')).data,before);
}
