import test from 'node:test';
import assert from 'node:assert/strict';
import { billingAccountId, purchaseTokenHash, BillingError } from '../supabase/functions/_shared/billing-model.ts';
import { createGooglePurchaseReader, verifyGoogleReceipt } from '../supabase/functions/_shared/billing-google.ts';
import { createBillingBackend } from '../supabase/functions/_shared/billing-backend.ts';
import { createBillingHandler } from '../supabase/functions/_shared/billing-handler.ts';
import { parsePurchaseReceipt, parsePurchaseHistory, purchaseStateLabel } from '../src/modules/packs/purchases.ts';

const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const products=[{productId:'qa_basic',packId:'basic'}], secret='isolated-test-secret-not-for-use!!';
const accountId=await billingAccountId(owner,secret);
const raw=(overrides={})=>({testPurchaseContext:{fopType:'TEST'},regionCode:'KR',obfuscatedExternalAccountId:accountId,
  purchaseStateContext:{purchaseState:'PURCHASED'},purchaseCompletionTime:'2026-11-22T01:00:00Z',
  productLineItem:[{productId:'qa_basic',productOfferDetails:{quantity:1,refundableQuantity:1,consumptionState:'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}],...overrides});
const verify=(v)=>verifyGoogleReceipt(v,'isolated-receipt',accountId,products);
const publicReceipt={purchaseId:owner,productId:'qa_basic',packId:'basic',state:'verified',deliveryState:'not_granted',purchasedAt:'2026-11-22T01:00:00Z',orderId:null,testPurchase:true};

test('billing account binding is stable, keyed, scoped and never contains the user identifier', async()=>{
  assert.match(accountId,/^[a-f0-9]{64}$/);
  assert.equal(await billingAccountId(owner,secret),accountId);
  assert.notEqual(await billingAccountId(other,secret),accountId);
  assert.notEqual(await billingAccountId(owner,secret+'changed'),accountId);
  await assert.rejects(billingAccountId(owner,'short'));
});
test('only Google-verified single-unit test receipts pass, without requiring an order ID',async()=>{
  const receipt=await verify(raw());
  assert.equal(receipt.state,'verified'); assert.equal(receipt.orderId,null);
  assert.equal(receipt.tokenHash,await purchaseTokenHash('isolated-receipt'));
  assert.equal(receipt.purchasedAt,'2026-11-22T01:00:00.000Z');
  assert.equal(JSON.stringify(receipt).includes('isolated-receipt'),false);
  assert.equal((await verify(raw({purchaseStateContext:{purchaseState:'PENDING'},purchaseCompletionTime:undefined}))).state,'pending');
  assert.equal((await verify(raw({purchaseStateContext:{purchaseState:'CANCELLED'}}))).state,'cancelled');
  const refunded=raw(); refunded.productLineItem[0].productOfferDetails.refundableQuantity=0;
  assert.equal((await verify(refunded)).state,'cancelled');
});
test('real money, unknown products, missing binding, multiple units and malformed Google data fail closed',async()=>{
  const cases=[raw({testPurchaseContext:undefined}),raw({testPurchaseContext:{fopType:'FOP_TYPE_UNSPECIFIED'}}),
    raw({obfuscatedExternalAccountId:other}),raw({obfuscatedExternalAccountId:undefined}),raw({regionCode:'US'}),raw({regionCode:undefined}),
    raw({productLineItem:[]}),raw({productLineItem:[...raw().productLineItem,...raw().productLineItem]}),
    raw({purchaseCompletionTime:undefined}),raw({purchaseCompletionTime:'bad'}),raw({orderId:''}),
    raw({purchaseStateContext:{purchaseState:'NEW_STATE'}})];
  for(const [key,value] of [['quantity',2],['quantity',undefined],['consumptionState','NEW'],['rentOfferDetails',{}],['preorderOfferDetails',{}],['refundableQuantity',-1]]) {
    const v=raw();v.productLineItem[0].productOfferDetails[key]=value;cases.push(v);
  }
  const unknown=raw();unknown.productLineItem[0].productId='forged';cases.push(unknown);
  for(const v of cases) await assert.rejects(verify(v),BillingError);
});
test('Google adapter pins package/path, uses server credentials and never consumes or acknowledges',async()=>{
  const calls=[];
  const reader=createGooglePurchaseReader(async()=> 'server-only',async(url,init)=>{calls.push({url,init});return Response.json(raw());});
  await reader('test/opaque?token');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.runningart.mobile.dev/purchases/productsv2/tokens/test%2Fopaque%3Ftoken');
  assert.equal(calls[0].init.headers.authorization,'Bearer server-only');
  assert.equal(calls[0].init.redirect,'error');
  assert.equal(calls[0].init.method,undefined); assert.equal(calls[0].init.body,undefined);
  for(const token of ['', '.', '..', 'token\nvalue','x'.repeat(4097)]) await assert.rejects(reader(token),{code:'invalid_request'});
  assert.equal(calls.length,1);
});
test('provider outage details and token-bearing URLs never reach the caller',async()=>{
  for(const [status,code] of [[400,'purchase_not_found'],[404,'purchase_not_found'],[401,'store_unavailable'],[429,'store_unavailable'],[500,'store_unavailable']]) {
    const reader=createGooglePurchaseReader(async()=> 'secret',async()=>new Response('private token upstream',{status}));
    await assert.rejects(reader('token'),error=>error.code===code&&!error.message.includes('private'));
  }
  const reader=createGooglePurchaseReader(async()=>{throw Error('secret token URL');});
  await assert.rejects(reader('token'),{message:'store_unavailable'});
});

function handlerFixture(mode) {
  const calls=[];
  const backend={async authenticate(token){calls.push('auth');if(token!=='test-session')throw new BillingError('authentication_required',401);return owner;},
    async assertEligible(id){calls.push(['eligible',id]);},
    async record(id,r){calls.push(['record',id,r]);return publicReceipt;},
    async history(id,cursor){calls.push(['history',id,cursor]);return {purchases:[],nextCursor:null};}};
  const options={backend,readGoogle:async()=>{calls.push('google');return raw();},products,accountKey:secret,testOwners:[owner],mode};
  const request=(body,headers={})=>new Request('https://billing.invalid/',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test-session',...headers},body:JSON.stringify(body)});
  return {calls,backend,options,request,handler:createBillingHandler(options)};
}
test('disabled by default: preparation cannot accidentally open checkout or touch services',async()=>{
  const f=handlerFixture();
  assert.deepEqual(await (await f.handler(f.request({action:'capabilities'}))).json(),{checkoutEnabled:false,verificationEnabled:false});
  for(const body of [{action:'context'},{action:'verify',purchaseToken:'token'},{action:'history'}]) assert.equal((await f.handler(f.request(body))).status,503);
  assert.deepEqual(f.calls,[]);
});
test('verify-test-only authenticates and checks membership before contacting Google or persisting',async()=>{
  const f=handlerFixture('verify-test-only');
  const response=await f.handler(f.request({action:'verify',purchaseToken:'token'}));
  assert.equal(response.status,200);assert.equal((await response.json()).deliveryState,'not_granted');
  assert.deepEqual(f.calls.slice(0,3),['auth',['eligible',owner],'google']);
  assert.equal(f.calls[3][0],'record');assert.equal(f.calls[3][1],owner);
  assert.equal(f.calls[3][2].accountId,accountId);
  const context=await (await f.handler(f.request({action:'context'}))).json();
  assert.deepEqual(context,{checkoutEnabled:false,obfuscatedAccountId:accountId,products});
  const history=await f.handler(f.request({action:'history',cursor:other}));
  assert.equal(history.status,200);assert.deepEqual(f.calls.at(-1),['history',owner,other]);
});
test('HTTP rejects forged owner/benefits, broken input and invalid sessions without verification',async()=>{
  const f=handlerFixture('verify-test-only');
  for(const body of [null,[],{action:'__proto__'},{action:'verify',purchaseToken:'token',ownerId:other},{action:'verify',purchaseToken:'token',generation:1000},
    {action:'verify',purchaseToken:' '},{action:'verify',purchaseToken:'x'.repeat(10000)},{action:'history',cursor:'bad'}]) {
    assert.equal((await f.handler(f.request(body))).status,400);
  }
  assert.deepEqual(f.calls,[]);
  assert.equal((await f.handler(f.request({action:'verify',purchaseToken:'token'},{authorization:'Bearer invalid'}))).status,401);
  assert.deepEqual(f.calls,['auth']);
  const forbidden=createBillingHandler({...f.options,testOwners:[other]});
  assert.equal((await forbidden(f.request({action:'verify',purchaseToken:'token'}))).status,403);
  f.backend.assertEligible=async()=>{throw new BillingError('membership_required',403);};
  assert.equal((await f.handler(f.request({action:'verify',purchaseToken:'token'}))).status,403);
  assert.equal(f.calls.includes('google'),false);
});
test('test mode cannot start with incomplete config or duplicate store IDs',()=>{
  const f=handlerFixture();
  for(const overrides of [{accountKey:''},{testOwners:[]},{testOwners:['bad']},{products:[]},{products:[...products,...products]}]) {
    assert.throws(()=>createBillingHandler({...f.options,mode:'verify-test-only',...overrides}),{code:'billing_unconfigured'});
  }
});
test('Supabase boundary authenticates on server, does not bind usage or transmit the raw purchase token',async()=>{
  const calls=[];
  const backend=createBillingBackend({url:'https://isolated.invalid/',serviceKey:'server-key'},async(url,init)=>{
    calls.push({url,init});return Response.json(url.endsWith('/user')?{id:owner,is_anonymous:false}:{purchases:[],nextCursor:null});
  });
  assert.equal(await backend.authenticate('session'),owner);
  await backend.assertEligible(owner);await backend.record(owner,await verify(raw()));await backend.history(owner,null);
  assert.equal(calls.length,4);assert.equal(calls[0].init.headers.authorization,'Bearer session');
  assert.equal(calls[2].init.headers.authorization,'Bearer server-key');
  assert.equal(JSON.stringify(calls).includes('isolated-receipt'),false);
  assert.equal(calls.some(c=>c.url.includes('usage')),false);
  const anonymous=createBillingBackend({url:'https://isolated.invalid',serviceKey:'secret'},async()=>Response.json({id:owner,is_anonymous:true}));
  await assert.rejects(anonymous.authenticate('session'),{code:'authentication_required'});
  const unavailable=createBillingBackend({url:'https://isolated.invalid',serviceKey:'secret'},async()=>Response.json({message:'private database details'},{status:500}));
  await assert.rejects(unavailable.history(owner,null),{message:'billing_unavailable'});
});
test('public receipt contract separates verification from delivery and drops unexpected private fields',()=>{
  assert.deepEqual(parsePurchaseReceipt({...publicReceipt,purchaseToken:'private',accountId:'private'}),publicReceipt);
  assert.equal(purchaseStateLabel(publicReceipt),'결제 확인 · 팩 적용 전');
  assert.deepEqual(parsePurchaseHistory({purchases:[],nextCursor:null}),{purchases:[],nextCursor:null});
  assert.throws(()=>parsePurchaseHistory({error:'unavailable'}));
  for(const overrides of [{state:'confirmed'},{state:'granted'},{deliveryState:'granted'},{testPurchase:false},{purchasedAt:null},{orderId:undefined},{purchaseId:'order-id'}]) assert.throws(()=>parsePurchaseReceipt({...publicReceipt,...overrides}));
  assert.throws(()=>parsePurchaseHistory({purchases:[publicReceipt,publicReceipt],nextCursor:null}));
  assert.throws(()=>parsePurchaseHistory({purchases:[publicReceipt],nextCursor:owner}));
  assert.throws(()=>parsePurchaseHistory({purchases:[publicReceipt]}));
});
