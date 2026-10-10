import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { once } from 'node:events';
import { buildGraph, search } from '../src/modules/route-engine/engine.ts';
import { COMPUTE_CONTRACT, parseComputeRequest, parseComputeResponse } from '../src/modules/route-compute/contract.ts';
import { createRemoteCalculation, computeBaseUrl } from '../src/modules/route-compute/client.ts';
import { createLabSession } from '../src/features/route-lab/session.ts';
import { createComputeServer } from '../server/route-compute/server.mjs';
import { createComputePool } from '../server/route-compute/pool.mjs';
import { createServerRoads } from '../server/route-compute/roads.mjs';
import { nationalFixture } from './helpers/national-fixture.mjs';

const request = {contract:COMPUTE_CONTRACT,origin:{lat:37.4979,lng:127.0276},options:{version:'0.2',mode:'free-loop',shape:'heart',targetKm:3,radiusKm:2},refresh:false};
const input = {...request,elements:[]};
const envelope = result => ({contract:COMPUTE_CONTRACT,request:parseComputeRequest(request),result,
  metrics:{elapsedMs:1,computeMs:1,maxSliceMs:1,yields:0,nodes:1,edges:1,routing:{}},
  roads:{release:'test',manifestHash:'a'.repeat(64),cached:false},timing:{roadMs:1,calculationMs:1,totalMs:2}});
const local = {result:{candidates:[]},metrics:{}};
const reply = value => new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});

test('request bounds exclude heavy input, remote URLs and unsupported modes', () => {
  assert.deepEqual(parseComputeRequest({...request,url:'https://evil.test',elements:[1]}),request);
  for (const options of [{radiusKm:10},{targetKm:100},{mode:'anchored'},{version:'0.3'},{shape:'custom',customTemplate:[]},{customTemplate:[{}]}]) {
    assert.throws(()=>parseComputeRequest({...request,options:{...request.options,...options}}));
  }
  assert.throws(()=>parseComputeRequest({...request,origin:{lat:NaN,lng:127}}));
  assert.throws(()=>parseComputeRequest({...request,origin:{lat:40,lng:127}}));
  assert.equal(computeBaseUrl('https://x.run.app'),'https://x.run.app');
  for (const url of ['http://x.run.app','https://x.run.app/path','https://user:pass@x.run.app','https://x.run.app?token=1']) assert.equal(computeBaseUrl(url),null);
});

test('serialized real engine result survives strict response contract; corrupt paths fail', async () => {
  const grid=JSON.parse(fs.readFileSync('assets/route-lab/grid.json','utf8'));
  const result=JSON.parse(JSON.stringify(search(buildGraph(grid.elements,grid.origin,2000),request.options)));
  const value=envelope(result);
  assert.deepEqual(parseComputeResponse(JSON.parse(JSON.stringify(value)),request).result,result);
  const changed=structuredClone(value);changed.result.candidates[0].route[0].x=null;
  assert.throws(()=>parseComputeResponse(changed,request));
  assert.throws(()=>parseComputeResponse({...value,contract:'future'},request));
  assert.throws(()=>parseComputeResponse(value,{...request,origin:{lat:37.5,lng:127}}));
  let sent;
  const remote=createRemoteCalculation('https://x.run.app',async(url,init)=>{sent={url,init};return reply(value);});
  assert.deepEqual((await remote(input,new AbortController().signal,false)).result,result);
  assert.equal(sent.init.headers.authorization,undefined);
  assert.equal(JSON.parse(sent.init.body).elements,undefined);
});

test('remote transport times out even with uncooperative fetch and honours cancellation', async () => {
  const remote=createRemoteCalculation('https://x.run.app',()=>new Promise(()=>{}),20);
  await assert.rejects(remote(input,new AbortController().signal,false),/초과/);
  const controller=new AbortController();const pending=remote(input,controller.signal,false);controller.abort();
  await assert.rejects(pending,error=>error.name==='CalculationCancelled');
  for (const response of [new Response('',{status:429}),new Response('{}',{headers:{'content-type':'text/html'}}),new Response('{}',{headers:{'content-type':'application/json','content-length':'999999999'}})]) {
    await assert.rejects(createRemoteCalculation('https://x.run.app',async()=>response)(input,new AbortController().signal,false));
  }
});

test('guest online uses server, offline and fixtures stay local, failures fall back once', async () => {
  let loads=0,runs=0,remotes=0,fail=false,value;
  const session=createLabSession(async()=>{loads++;return {elements:[],source:'roads',cached:true};},async()=>{runs++;return local;},undefined,async()=>{remotes++;if(fail)throw new Error('busy');return envelope(local.result);});
  const callbacks={progress:()=>{},success:v=>{value=v;},error:e=>{throw e;}};
  await session.start({input,liveRoads:true},callbacks);
  assert.equal(value.execution,'server');assert.equal(loads,0);assert.equal(runs,0);
  await session.start({input,liveRoads:true,roadMode:'offline'},callbacks);
  await session.start({input,liveRoads:false},callbacks);
  assert.equal(remotes,1);assert.equal(runs,2);
  fail=true;await session.start({input,liveRoads:true},callbacks);
  assert.equal(value.fallback,true);assert.equal(value.execution,'device');assert.equal(runs,3);
});

test('cancelled late server reply cannot overwrite newer result or trigger local fallback', async () => {
  let finish,success=0;
  const session=createLabSession(()=>{throw Error('unexpected local');},()=>{throw Error('unexpected compute');},undefined,()=>new Promise(resolve=>{finish=resolve;}));
  const pending=session.start({input,liveRoads:true},{progress:()=>{},success:()=>success++,error:e=>{throw e;}});
  session.cancel();finish(envelope(local.result));await pending;assert.equal(success,0);
});

test('HTTP accepts guests; rejects malformed/oversized input and excess concurrency', async t => {
  let resolve,aborted=false;
  const pool={run:(_r,signal)=>new Promise(done=>{resolve=done;signal.addEventListener('abort',()=>{aborted=true;done({});});}),close:async()=>{}};
  const server=createComputeServer(pool);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=body=>fetch(`${base}/v1/routes`,{method:'POST',headers:{'content-type':'application/json'},body});
  assert.equal((await fetch(`${base}/healthz`)).status,200);
  assert.equal((await post('{}')).status,400);
  assert.equal((await post('x'.repeat(17000))).status,413);
  const pending=post(JSON.stringify(request));while(!resolve)await new Promise(done=>setTimeout(done,5));
  assert.equal((await post(JSON.stringify(request))).status,429);
  resolve(envelope(local.result));assert.equal((await pending).status,200);
  const controller=new AbortController();resolve=undefined;
  const cancelled=fetch(`${base}/v1/routes`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:controller.signal}).catch(()=>{});
  while(!resolve)await new Promise(done=>setTimeout(done,5));controller.abort();await cancelled;
  for(let i=0;i<100&&!aborted;i++)await new Promise(done=>setTimeout(done,5));assert.equal(aborted,true);
});

test('CPU worker timeout, cancellation and crash recover for subsequent requests', async t => {
  const pool=createComputePool({workerUrl:new URL('./fixtures/compute-worker.mjs',import.meta.url),timeoutMs:300});t.after(()=>pool.close());
  const signal=new AbortController().signal;
  await assert.rejects(pool.run('hang',signal),error=>error.status===504);
  assert.equal(await pool.run('after-timeout',signal),'after-timeout');
  const controller=new AbortController();const job=pool.run('hang',controller.signal);controller.abort();
  await assert.rejects(job,error=>error.code==='cancelled');
  await assert.rejects(pool.run('crash',signal),error=>error.status===503);
  assert.equal(await pool.run('recovered',signal),'recovered');
});

test('server road loader uses verified national tiles and reuses bounded cache', async () => {
  const fixture=nationalFixture();let calls=0;
  const load=await createServerRoads('https://roads.test',async url=>{
    calls++;const object=fixture.objects.get(new URL(url).pathname.slice(1));assert.ok(object,url);
    const response = new Response(object.body,{headers:{'content-type':object.contentType,'content-length':String(object.body.length)}});
    return {status:200,url,redirected:false,headers:response.headers,body:response.body};
  });
  const r={...request,origin:{lat:37.5,lng:127}};
  const first=await load(r,new AbortController().signal),before=calls;
  const second=await load(r,new AbortController().signal);
  assert.deepEqual(first.elements,second.elements);assert.equal(first.elements.length,1);assert.equal(calls,before);assert.equal(second.downloaded,0);
});
