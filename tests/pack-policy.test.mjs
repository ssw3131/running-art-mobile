import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { packCatalog } from '../src/modules/packs/catalog.ts';
import { packPolicy, residualRefundKrw, nextCreditSource, availableCredits, refundResolution } from '../src/modules/packs/policy.ts';

test('planner catalogue and lifetime/notice decisions are explicit without an invented launch end date',()=>{
  assert.deepEqual(packCatalog.map(p=>[p.id,p.priceKrw,p.postLaunchPriceKrw,p.generation,p.save]),[
    ['basic',1900,2500,10,20],['plus',2900,3900,30,60],['expanded',4900,7500,60,120]]);
  assert.equal(packPolicy.expiresAfterDays,null);assert.equal(packPolicy.launchEndsAt,null);
  assert.equal(packPolicy.minimumAge,19);assert.equal(packPolicy.launchPriceNoticeDays,14);
});
test('all six planner refund examples round only at the end with no fee deduction',()=>{
  for(const [generation,save,expected] of [[30,60,2900],[20,50,2175],[0,60,1450],[30,0,1450],[1,0,49],[0,0,0]]) {
    assert.equal(residualRefundKrw({paidKrw:2900,refundedKrw:0,granted:{generation:30,save:60},remaining:{generation,save}}),expected);
  }
});
test('refund uses historical actual payment, caps prior refunds, and preserves exact integer arithmetic',()=>{
  const args={paidKrw:2501,refundedKrw:0,granted:{generation:10,save:20},remaining:{generation:1,save:0}};
  assert.equal(residualRefundKrw(args),126);
  assert.equal(residualRefundKrw({...args,refundedKrw:2490}),11);
  assert.equal(residualRefundKrw({...args,paidKrw:0}),0); // free compensation has no cash value
  const max=Number.MAX_SAFE_INTEGER;
  assert.equal(residualRefundKrw({paidKrw:max,refundedKrw:0,granted:{generation:max,save:max},remaining:{generation:max,save:max}}),max);
  for(const overrides of [{paidKrw:-1},{paidKrw:2.9},{refundedKrw:3000},{remaining:{generation:11,save:20}},{granted:{generation:0,save:0}},{paidKrw:Infinity}]) {
    assert.throws(()=>residualRefundKrw({...args,...overrides}));
  }
  for(const pack of packCatalog) for(let g=0;g<=pack.generation;g++) for(let s=0;s<=pack.save;s++) {
    const amount=residualRefundKrw({paidKrw:pack.priceKrw,refundedKrw:0,granted:pack,remaining:{generation:g,save:s}});
    assert.ok(amount>=0&&amount<=pack.priceKrw);
    if(g===pack.generation&&s===pack.save) assert.equal(amount,pack.priceKrw);
  }
});
const lot=(id,source,day,generation,save,extra={})=>({id,source,acquiredAt:`2026-11-${day}T00:00:00Z`,remaining:{generation,save},reserved:{generation:0,save:0},refundHeld:false,...extra});
test('free first, paid FIFO, distinct balances, additions and refund holds preserve other purchases',()=>{
  const lots=[lot('new','paid',22,30,60),lot('old','paid',20,7,12),lot('free','free',21,1,0)];
  const before=structuredClone(lots);
  assert.equal(nextCreditSource(lots,'generation'),'free');assert.equal(nextCreditSource(lots,'save'),'old');
  assert.deepEqual(availableCredits(lots.slice(0,2)),{generation:37,save:72});
  const held=lots.map(l=>l.id==='old'?{...l,refundHeld:true}:l);
  assert.equal(nextCreditSource(held,'save'),'new');assert.equal(nextCreditSource(held,'generation'),'free');
  assert.deepEqual(availableCredits(held),{generation:31,save:60});
  const reserved=[lot('last','paid',22,1,1,{reserved:{generation:1,save:0}})];
  assert.equal(nextCreditSource(reserved,'generation'),null);assert.equal(nextCreditSource(reserved,'save'),'last');
  assert.deepEqual(lots,before);
  assert.throws(()=>nextCreditSource([lots[0],lots[0]],'save'));
  assert.throws(()=>availableCredits([lot('bad','paid',22,1,0,{reserved:{generation:2,save:0}})]));
});
test('refund outcome uncertainty never releases or revokes the held balance prematurely',()=>{
  assert.deepEqual(refundResolution('unknown'),{hold:true,revokeRemaining:false});
  assert.deepEqual(refundResolution('succeeded'),{hold:false,revokeRemaining:true});
  for(const state of ['failed','cancelled']) assert.deepEqual(refundResolution(state),{hold:false,revokeRemaining:false});
});
test('product screens no longer import terrain services or expose the retired terrain route',()=>{
  const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):/\.tsx?$/.test(e.name)?[join(dir,e.name)]:[]);
  for(const file of [...walk('src/app'),...walk('src/features')]) {
    const source=readFileSync(file,'utf8');
    assert.doesNotMatch(source,/(?:from\s*|import\s*\()['"][^'"]*(?:terrain\/(?:client|controller)|use-terrain|use-recommendation-terrain)/,file);
    assert.doesNotMatch(source,/maptiler\.com\/elevation/,file);
  }
  assert.match(readFileSync('src/app/course-terrain.tsx','utf8'),/<Redirect href="\/courses"/);
});
