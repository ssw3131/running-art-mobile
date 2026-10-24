// Figma geometry/version, distance ceiling and recommendation regressions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseComputeRequest, parseComputeResponse, COMPUTE_CONTRACT, CURRENT_COMPUTE_CONTRACT } from '../src/modules/route-compute/contract.ts';
import { FIGMA_SHAPE_VERSION } from '../src/modules/route-engine/figma-contours.ts';
import { templateFor, search, buildGraph } from '../src/modules/route-engine/engine.ts';
import { estimatedRunningMinutes, terrainDifficulty } from '../src/features/course-generation/recommendation-metrics.ts';
import { parsePlaces, createPlaceSearch } from '../src/modules/map/place-search.ts';
import { encodeSnapshot, decodeSnapshot } from '../src/modules/courses/model.ts';
import { request as oldRequest, response } from './helpers/compute-contract.mjs';
import { readFileSync } from 'node:fs';

const current = { ...oldRequest, contract: CURRENT_COMPUTE_CONTRACT,
  options: { ...oldRequest.options, shapeVersion: FIGMA_SHAPE_VERSION, maxRouteKm: 20 } };
test('new request and legacy request keep distinct geometry and limits', () => {
  assert.deepEqual(parseComputeRequest(oldRequest), oldRequest);
  assert.equal(parseComputeRequest(current).contract, CURRENT_COMPUTE_CONTRACT);
  assert.throws(() => parseComputeRequest({ ...current, contract: COMPUTE_CONTRACT }));
  for (const patch of [{targetKm:21},{maxRouteKm:40},{targetKm:20,radiusKm:2},{shapeVersion:'other'}])
    assert.throws(() => parseComputeRequest({ ...current, options: { ...current.options, ...patch } }));
  assert.equal(parseComputeRequest({ ...current, options: { ...current.options, targetKm:20, radiusKm:5, shape:'whale' } }).options.targetKm,20);
  assert.notDeepEqual(templateFor('cat'), templateFor('cat', FIGMA_SHAPE_VERSION));
  assert.ok(templateFor('person').length);
});
test('response contract mismatch and over-20km geometry are rejected independently of displayed length', () => {
  const value = response(oldRequest);
  assert.throws(() => parseComputeResponse(value, current));
  const converted = { ...value, contract: CURRENT_COMPUTE_CONTRACT, request: current, result: structuredClone(value.result) };
  converted.result.candidates[0].route[1] = {x:30000,y:0};
  assert.throws(() => parseComputeResponse(converted,current));
});
test('route cap filters before selecting candidates and never cuts a loop', () => {
  const input=JSON.parse(readFileSync(new URL('../assets/route-lab/grid.json',import.meta.url),'utf8'));
  const graph=buildGraph(input.elements,input.origin,input.options.radiusKm*1000);
  const result=search(graph,{...input.options,mode:'free-loop',maxRouteKm:0.01});
  assert.equal(result.candidates.length,0);
});
test('20km ceiling explores smaller complete shapes while keeping closed valid candidates', () => {
  const input=JSON.parse(readFileSync(new URL('../assets/route-lab/grid.json',import.meta.url),'utf8'));
  const elements=input.elements.map(way=>({...way,geometry:way.geometry?.map(p=>({
    lat:input.origin.lat+(p.lat-input.origin.lat)*3,lon:input.origin.lng+(p.lon-input.origin.lng)*3}))}));
  const result=search(buildGraph(elements,input.origin,5000),{version:'0.2',mode:'free-loop',shape:'heart',
    targetKm:20,radiusKm:5,shapeVersion:FIGMA_SHAPE_VERSION,maxRouteKm:20});
  assert.ok(result.candidates.length>0);
  for (const c of result.candidates) {
    assert.ok(c.score.lengthKm>=15 && c.score.lengthKm<=20);
    assert.deepEqual(c.route[0],c.route.at(-1));
    assert.ok(c.roadSegments.length>0);
  }
});
test('ETA derives from actual distance and difficulty uses length weighting and absolute grade', () => {
  assert.equal(estimatedRunningMinutes(5.12),33);assert.equal(estimatedRunningMinutes(6.38),41);
  assert.equal(estimatedRunningMinutes(20),130);assert.equal(estimatedRunningMinutes(NaN),null);
  const profile=grades=>({length:1000,ascent:30,points:[{distance:0},{distance:250},{distance:1000}],segments:grades.map(grade=>({grade}))});
  assert.equal(terrainDifficulty(profile([0,4])).level,1);
  assert.equal(terrainDifficulty(profile([-6,6])).level,2);
  assert.equal(terrainDifficulty(profile([2,2])).level,0);
  assert.equal(terrainDifficulty(profile([NaN,2])),null);
});
test('v4 built-in and custom snapshots round trip; old bytes stay stable', () => {
  const route=[[127,37.5],[127.001,37.501],[127,37.5]];
  const old={schemaVersion:1,engineVersion:'0.2',source:'synthetic',shape:'person',origin:{lat:37.5,lng:127},targetKm:1,lengthKm:1,score:50,route,target:route};
  const original=encodeSnapshot(old);assert.deepEqual(encodeSnapshot(decodeSnapshot(original.json,original.hash)),original);
  for (const shape of ['whale','cat','custom']) {
    const snapshot={...old,schemaVersion:4,shape,shapeVersion:FIGMA_SHAPE_VERSION,...(shape==='custom'?{customTemplate:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:0}]}:{})};
    const encoded=encodeSnapshot(snapshot);assert.equal(decodeSnapshot(encoded.json,encoded.hash).shapeVersion,FIGMA_SHAPE_VERSION);
  }
  assert.throws(()=>encodeSnapshot({...old,schemaVersion:4}));
});
test('place results respect supported bounds and search encodes the query without leaking network errors', async () => {
  const features=[{id:'test',text:'공원',place_name:'서울 공원',center:[127,37.5]},{id:'outside',place_name:'Outside',center:[0,0]}];
  assert.equal(parsePlaces({features}).length,1);
  let url;
  const search=createPlaceSearch(async value=>{url=value;return {ok:true,json:async()=>({features})};});
  assert.equal((await search('공원 & 강',{lat:37.5,lng:127},'public-test-key',new AbortController().signal))[0].name,'공원');
  assert.ok(url.includes(encodeURIComponent('공원 & 강')));
  assert.ok(new URL(url).searchParams.get('types').split(',').includes('poi'));
  const failing=createPlaceSearch(async()=>{throw Error('sensitive network URL');});
  await assert.rejects(failing('공원',{lat:37.5,lng:127},'test',new AbortController().signal),error=>!error.message.includes('sensitive'));
});
