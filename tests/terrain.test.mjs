import test from 'node:test';
import assert from 'node:assert/strict';
import { AbortController as NativeAbortController } from 'abort-controller';
import { sampleRoute, analyzeTerrain, reverseTerrain, terrainBand, terrainFeatures, terrainDirection, nearestTerrainPoint } from '../src/modules/terrain/model.ts';
import { createTerrainLoader } from '../src/modules/terrain/client.ts';
import { createTerrainController } from '../src/modules/terrain/controller.ts';

const line = [[127,37],[127,37.009]], square = [[127,37],[127.005,37],[127.005,37.005],[127,37.005],[127,37]];
const approx = (a,b,tolerance=1e-8) => assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`);
const mockResponse = (url, height=()=>10) => new Response(JSON.stringify(decodeURIComponent(new URL(url).pathname.slice('/elevation/'.length,-5)).split(';').map((p,i)=>[...p.split(',').map(Number),height(i)])));
const fixture = () => {const route=sampleRoute(square);return analyzeTerrain(route,route.samples.slice(0,-1).map((_,i)=>30+20*Math.sin(i/(route.samples.length-1)*Math.PI*2)));};

test('sampling owns coordinates, bounds requests and reuses the loop seam',()=>{
  const original=structuredClone(square), s=sampleRoute(square);
  assert.ok(s.closed);assert.deepEqual(s.samples[0].coordinate,s.samples.at(-1).coordinate);
  assert.ok(s.samples.length<=201);assert.ok(s.length/(s.samples.length-1)<=50);
  s.coordinates[0][0]=0;assert.deepEqual(square,original);
  assert.equal(sampleRoute([[127,37],[127,38]]).samples.length,201);
  assert.deepEqual(sampleRoute([line[0],line[0],line[1]]).samples,sampleRoute(line).samples);
});
test('invalid and degenerate geometry is rejected without network input',()=>{
  for(const value of [[],[[0,0]],[[NaN,0],[1,1]],[[0,0],[0,0]],[[181,0],[1,1]],[[0,86],[0,87]]]) assert.throws(()=>sampleRoute(value));
});
test('flat terrain stays flat including loop seam and nonzero altitude',()=>{
  for(const input of [line,square]) {
    const s=sampleRoute(input), p=analyzeTerrain(s,Array(s.samples.length-(s.closed?1:0)).fill(115));
    assert.equal(p.ascent,0);assert.equal(p.descent,0);assert.equal(p.minimum,115);assert.equal(p.maximum,115);
    assert.ok(p.segments.every(s=>s.grade===0));
  }
});
test('linear uphill/downhill retains endpoint gain and grade under smoothing',()=>{
  const s=sampleRoute(line);
  for(const slope of [.04,-.08]) {
    const p=analyzeTerrain(s,s.samples.map(p=>20+p.distance*slope));
    p.segments.forEach(segment=>approx(segment.grade,slope*100));
    approx(p.ascent,Math.max(0,s.length*slope));approx(p.descent,Math.max(0,-s.length*slope));
  }
});
test('loop averaging is continuous and ascent equals descent despite nonzero hills',()=>{
  const p=fixture();assert.ok(p.ascent>30);approx(p.ascent,p.descent);
  assert.equal(p.points[0].elevation,p.points.at(-1).elevation);
  const s=sampleRoute(square), values=s.samples.slice(0,-1).map((_,i)=>i===0?30:0), smoothed=analyzeTerrain(s,values);
  assert.equal(smoothed.points[0].elevation,10);assert.equal(smoothed.points[1].elevation,10);assert.equal(smoothed.points.at(-2).elevation,10);
});
test('segments preserve all road corners instead of joining samples with shortcuts',()=>{
  const s=sampleRoute(square), p=analyzeTerrain(s,s.samples.slice(0,-1).map(()=>10));
  for(const vertex of square) assert.ok(p.segments.some(segment=>segment.coordinates.some(c=>c[0]===vertex[0]&&c[1]===vertex[1])));
  for(let i=1;i<p.segments.length;i++) assert.deepEqual(p.segments[i-1].coordinates.at(-1),p.segments[i].coordinates[0]);
});
test('reversing swaps ascent/descent, signs, geometry and preserves map colors',()=>{
  const p=fixture(), before=structuredClone(p), reversed=reverseTerrain(p), twice=reverseTerrain(reversed);
  assert.deepEqual(p,before);approx(reversed.ascent,p.descent);
  for(let i=0;i<p.segments.length;i++) {
    const r=reversed.segments.at(-1-i);approx(r.grade,-p.segments[i].grade);
    assert.deepEqual(r.coordinates,[...p.segments[i].coordinates].reverse());
  }
  twice.points.forEach((point,i)=>approx(point.distance,p.points[i].distance));
  assert.deepEqual(terrainFeatures(p).features.map(f=>f.properties.color),terrainFeatures(reversed).features.reverse().map(f=>f.properties.color));
  assert.notDeepEqual(terrainDirection(p),terrainDirection(reversed));
});
test('boundary colors and graph endpoint selection are stable',()=>{
  assert.deepEqual([0,2.999,3,5.999,6,-3,-6].map(terrainBand),[0,0,1,1,2,1,2]);
  const p=fixture();assert.equal(nearestTerrainPoint(p,-1),0);assert.equal(nearestTerrainPoint(p,2),p.points.length-1);
  assert.equal(nearestTerrainPoint(p,.5),Math.round((p.points.length-1)/2));
});
test('missing, null, nonfinite and implausible elevations are rejected',()=>{
  const s=sampleRoute(line), n=s.samples.length;
  for(const values of [[],Array(n).fill(null),Array(n).fill(NaN),Array(n).fill(20000)]) assert.throws(()=>analyzeTerrain(s,values));
});
test('API batches at 50, deduplicates loop closure and memoizes only complete profiles',async()=>{
  const calls=[], loader=createTerrainLoader(async (url,init)=>{
    assert.equal(init.headers['Cache-Control'],'no-cache, no-store');calls.push(url);return mockResponse(url);
  });
  const route=[[127,37],[127.05,37],[127.05,37.05],[127,37.05],[127,37]];
  const p=await loader(route,'private-key',new NativeAbortController().signal);
  assert.equal(calls.length,4);
  for(const call of calls) assert.ok(new URL(call).pathname.split(';').length<=50);
  assert.equal(p.points.length,201);assert.equal(p.ascent,0);
  assert.equal(await loader(structuredClone(route),'private-key',new AbortController().signal),p);
  assert.equal(calls.length,4);
});
test('bad status and malformed response are redacted; failed results can be retried',async()=>{
  for(const status of [401,403,429,500]) {
    let count=0;const loader=createTerrainLoader(async url=>++count===1?new Response('',{status}):mockResponse(url));
    await assert.rejects(loader(line,'secret',new AbortController().signal),e=>!!e.code&&!e.message.includes('secret'));
    assert.ok(await loader(line,'secret',new AbortController().signal));assert.equal(count,2);
  }
  for(const data of [[],[[127,37,null]],[[127,37,Infinity]],[[0,0,10]],{error:'secret'}]) {
    const loader=createTerrainLoader(async()=>new Response(JSON.stringify(data)));
    await assert.rejects(loader(line,'secret',new AbortController().signal),/불완전/);
  }
  const loader=createTerrainLoader(async()=>{throw new Error('https://example?key=secret');});
  await assert.rejects(loader(line,'secret',new AbortController().signal),e=>!e.message.includes('secret')&&e.code==='network');
});
test('second batch failure never produces a partial profile or poisons cache',async()=>{
  let fail=true,calls=0;const loader=createTerrainLoader(async url=>{calls++;return fail&&calls===2?new Response('[]'):mockResponse(url);});
  const route=[[127,37],[127,37.08]];
  await assert.rejects(loader(route,'key',new AbortController().signal),/불완전/);
  fail=false;const p=await loader(route,'key',new AbortController().signal);
  assert.ok(p.points.length>100);assert.ok(calls>4);
});
test('missing key and aborted polyfill signal never issue requests',async()=>{
  let calls=0;const loader=createTerrainLoader(async url=>{calls++;return mockResponse(url);});
  await assert.rejects(loader(line,'',new AbortController().signal),e=>e.code==='key');
  const c=new NativeAbortController();c.abort();await assert.rejects(loader(line,'key',c.signal),e=>e.name==='AbortError');
  assert.equal(calls,0);
});
test('timeout and mid-request cancellation discard responses, even if fetch ignores abort',async()=>{
  const loader=createTerrainLoader(async url=>{await new Promise(r=>setTimeout(r,20));return mockResponse(url);},5);
  await assert.rejects(loader(line,'key',new AbortController().signal),e=>e.code==='timeout');
  let release;const late=createTerrainLoader(url=>new Promise(r=>{release=()=>r(mockResponse(url));}));
  const c=new NativeAbortController(), result=late(line,'key',c.signal);c.abort();release();
  await assert.rejects(result,e=>e.name==='AbortError');
});
test('controller ignores late success after hide, and duplicates do not requery',async()=>{
  let calls=0,release;const c=createTerrainController(line,'key',()=>{calls++;return new Promise(r=>{release=r;});});
  assert.equal(c.snapshot().status,'hidden');assert.equal(calls,0);
  const pending=c.show();await c.show();assert.equal(calls,1);
  c.hide();release(fixture());await pending;assert.equal(c.snapshot().status,'hidden');assert.equal(c.snapshot().profile,null);
  const retry=c.show();release(fixture());await retry;assert.equal(c.snapshot().status,'ready');
  c.hide();await c.show();assert.equal(calls,2);assert.equal(c.snapshot().status,'ready');
});
test('controller late error cannot overwrite newer success; reverse keeps selected location',async()=>{
  const deferred=[];const c=createTerrainController(square,'key',()=>new Promise((resolve,reject)=>deferred.push({resolve,reject})));
  const old=c.show();c.hide();const current=c.show();deferred[1].resolve(fixture());await current;
  deferred[0].reject(new Error('old'));await old;assert.equal(c.snapshot().status,'ready');
  c.select(7);const location=c.snapshot().profile.points[7].coordinate;c.reverse();
  assert.deepEqual(c.snapshot().profile.points[c.snapshot().selected].coordinate,location);
  c.select(NaN);assert.ok(Number.isInteger(c.snapshot().selected));
});
