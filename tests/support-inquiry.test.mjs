import test from 'node:test';
import assert from 'node:assert/strict';
import { createInquiryController } from '../src/modules/support/inquiry.ts';
import { createSupportRemote } from '../src/modules/support/remote.ts';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id='11111111-1111-4111-8111-111111111111';
const input={category:'기타',title:'의견',body:'첫째 줄\n둘째 줄',email:''};
const receipt={id,receivedAt:'2026-10-14T00:00:00Z'};
function fixture(send) {
 const values=new Map(); let current=owner;
 const deps={owner,currentOwner:()=>current,uuid:()=>id,send,storage:{getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{values.set(k,v);},removeItem:async k=>{values.delete(k);}}};
 return {deps,values,controller:createInquiryController(deps),switchOwner:()=>{current='other';}};
}
test('uncertain inquiry survives restart with exact content/request and clears only on verified receipt',async()=>{
 const calls=[];let fail=true; const f=fixture(async(...args)=>{calls.push(args);if(fail)throw Error('offline');return receipt;});
 await f.controller.load();await f.controller.submit(input);
 assert.equal(f.controller.getSnapshot().receipt,null);assert.equal(f.values.size,1);
 const restored=createInquiryController(f.deps);await restored.load();fail=false;
 await restored.submit({...input,title:'edited while pending'});
 assert.deepEqual(calls[0],calls[1]);assert.equal(restored.getSnapshot().receipt.id,id);assert.equal(f.values.size,0);
});
test('duplicate taps serialize, and an account change discards a late receipt',async()=>{
 let resolve;let calls=0;const f=fixture(()=>{calls++;return new Promise(r=>{resolve=r;});});
 await f.controller.load();const sending=f.controller.submit(input);
 await new Promise(r=>setImmediate(r));await f.controller.submit(input);assert.equal(calls,1);
 f.switchOwner();resolve(receipt);await sending;
 assert.equal(f.controller.getSnapshot().receipt,null);assert.equal(f.values.size,1);
});
test('persistence failure never sends or changes request id; raw errors never reach form',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return receipt;});await f.controller.load();
 f.deps.storage.setItem=async()=>{throw Error('secret database detail');};
 await f.controller.submit(input);assert.equal(calls,0);assert.equal(f.controller.getSnapshot().pending.id,id);
 assert.doesNotMatch(f.controller.getSnapshot().message,/secret/);
});
test('remote success requires a matching parseable receipt, optional contact remains empty',async()=>{
 let rpcArgs;const remote=createSupportRemote({rpc:async(name,args)=>{rpcArgs=args;return {data:{...receipt,id:'wrong'},error:null};}});
 await assert.rejects(remote.submit(owner,id,input),/receipt/);assert.equal(rpcArgs.p_email,'');
});
