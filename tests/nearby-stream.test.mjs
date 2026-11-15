import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createComputeServer} from '../server/route-compute/server.mjs';
import {createRemoteCalculation} from '../src/modules/route-compute/client.ts';
import {parseComputeRequest} from '../src/modules/route-compute/contract.ts';
import {usageFixture,usageHeaders} from './helpers/usage.mjs';
import {response,request} from './helpers/compute-contract.mjs';
const req=parseComputeRequest({...request,contract:'runpen-routes-v3',options:{...request.options,shapeVersion:'figma-20261024',maxRouteKm:20,proximity:'nearby-v1'}});
function value(){const v=structuredClone(response());v.contract=req.contract;v.request=req;v.result.candidates=[];v.result.proximity={stages:[300,500,1000],defaultIndex:null,comparisonRequired:false,sourceKnown:true};return v;}
test('stream handles split UTF-8 events and rejects missing results or terminal errors',async()=>{
 const lines=JSON.stringify({type:'progress',value:{phase:'nearby',text:'500m까지 넓히고 있어요.',accessLimitM:500}})+'\n'+JSON.stringify({type:'result',value:value()})+'\n';
 const bytes=new TextEncoder().encode(lines);const events=[];
 const fetcher=async()=>new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}),{headers:{'content-type':'application/x-ndjson'}});
 const remote=createRemoteCalculation('https://fixture.test',fetcher);const actual=await remote({...req,elements:[]},new AbortController().signal,false,e=>events.push(e));assert.equal(actual.contract,req.contract);assert.equal(events[0].text,'500m까지 넓히고 있어요.');
 for(const text of [lines.split('\n')[0]+'\n',JSON.stringify({type:'error',code:'timeout',message:'시간 초과'})+'\n'])await assert.rejects(createRemoteCalculation('https://fixture.test',async()=>new Response(text,{headers:{'content-type':'application/x-ndjson'}}))({...req,elements:[]},new AbortController().signal,false));
});
test('real HTTP emits actual progress, reserves once, replays final results and preserves JSON clients',async t=>{
 const usage=usageFixture();let runs=0;
 const server=createComputeServer({run:async(_r,_s,progress)=>{runs++;progress({phase:'nearby',text:'300m',accessLimitM:300});progress({phase:'comparison',text:'비교'});const v=value();v.result.candidates=structuredClone(response(req).result.candidates);return v;},close:async()=>{}},{usage});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const headers={'content-type':'application/json',accept:'application/x-ndjson',...usageHeaders()},url=`http://127.0.0.1:${server.address().port}/v1/routes`;
 const first=await fetch(url,{method:'POST',headers,body:JSON.stringify(req)});assert.match(first.headers.get('content-type'),/ndjson/);const events=(await first.text()).trim().split('\n').map(JSON.parse);assert.deepEqual(events.map(e=>e.type),['progress','progress','result']);assert.equal(usage.operations.size,1);
 const replay=await fetch(url,{method:'POST',headers,body:JSON.stringify(req)});assert.equal(replay.status,200);assert.match(replay.headers.get('content-type'),/application\/json/);await replay.json();assert.equal(runs,1);
 const legacy=await fetch(url,{method:'POST',headers:{...usageHeaders(),'content-type':'application/json'},body:JSON.stringify(request)});assert.match(legacy.headers.get('content-type'),/application\/json/);await legacy.json();
});
