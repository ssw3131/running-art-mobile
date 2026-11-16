import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {calculateRoute} from '../src/modules/route-engine/runner.ts';
import {buildGraph,search} from '../src/modules/route-engine/engine.ts';
const grid=JSON.parse(readFileSync('assets/route-lab/grid.json'));
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
 const server=createComputeServer({run:async(input,signal,progress)=>{runs++;const v=await calculateRoute({...input,origin:grid.origin,elements:grid.elements},{signal,onProgress:progress});return {...value(),contract:input.contract,request:input,...v};},close:async()=>{}},{usage});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const headers={'content-type':'application/json',accept:'application/x-ndjson',...usageHeaders()},url=`http://127.0.0.1:${server.address().port}/v1/routes`;
 const first=await fetch(url,{method:'POST',headers,body:JSON.stringify(req)});assert.match(first.headers.get('content-type'),/ndjson/);const events=(await first.text()).trim().split('\n').map(JSON.parse);assert.equal(events.at(-1).type,'result');for(const phase of ['nearby','comparison'])assert.ok(events.some(e=>e.type==='progress'&&e.value.phase===phase));assert.equal(usage.operations.size,1);
 const replay=await fetch(url,{method:'POST',headers,body:JSON.stringify(req)});assert.equal(replay.status,200);assert.match(replay.headers.get('content-type'),/application\/json/);await replay.json();assert.equal(runs,1);
 const legacy=await fetch(url,{method:'POST',headers:{...usageHeaders(),'content-type':'application/json'},body:JSON.stringify(request)});assert.match(legacy.headers.get('content-type'),/application\/json/);await legacy.json();
});


test('cancel interrupts an open progress stream and releases its reader',async()=>{
 let release,closed=false;const opened=new Promise(r=>release=r),controller=new AbortController();
 const fetcher=async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({type:'progress',value:{phase:'nearby',text:'300m'}})+'\n'));release();},cancel(){closed=true;}}),{headers:{'content-type':'application/x-ndjson'}});
 const remote=createRemoteCalculation('https://fixture.test',fetcher),result=remote({...req,elements:[]},controller.signal,false);
 await opened;await new Promise(r=>setTimeout(r,0));controller.abort();await assert.rejects(result,/취소/);assert.equal(closed,true);
});

test('below-minimum search streams the same empty result as the device and cancels the usage reservation',async t=>{
 const low=parseComputeRequest({...req,options:{...req.options,shape:'heart',targetKm:1}});
 const input={...low,origin:grid.origin,elements:grid.elements};
 const device=search(buildGraph(grid.elements,grid.origin,2000),low.options);
 assert.deepEqual(device.candidates,[]);
 const usage=usageFixture(),actions=[],command=usage.command.bind(usage);
 usage.command=async(...args)=>{actions.push(args[1]);return command(...args);};
 const server=createComputeServer({run:async(_request,signal,onProgress)=>({...value(),contract:low.contract,request:low,...await calculateRoute(input,{signal,onProgress})}),close:async()=>{}},{usage});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const headers={'content-type':'application/json',accept:'application/x-ndjson',...usageHeaders()};
 const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/routes`,{method:'POST',headers,body:JSON.stringify(low)});
 assert.equal(response.status,200);
 const events=(await response.text()).trim().split('\n').map(JSON.parse),result=events.at(-1);
 assert.equal(result.type,'result');assert.deepEqual(result.value.result,device);
 // HTTP progress is throttled; the final result, not every intermediate event,
 // guarantees all three stages ran.
 assert.ok(events.some(e=>e.type==='progress'&&e.value.phase==='nearby'));
 assert.deepEqual(result.value.result.proximity.stages,[300,500,1000]);
 assert.equal(usage.operations.get(headers['x-operation-id']).state,'cancelled');
 assert.ok(!actions.includes('ready'));assert.ok(!actions.includes('commit'));
});
