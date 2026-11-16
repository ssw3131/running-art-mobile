import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGraph,search} from '../src/modules/route-engine/engine.ts';
import {rankNearby} from '../src/modules/route-engine/nearby.ts';

const candidate=(raw,distance,id)=>({score:{raw},usage:{edges:new Map([[id,100]])},approach:distance===null?null:{distanceM:distance},recommendation:'unknown'});
const overlap=(a,b)=>[...a.keys()].some(k=>b.has(k))?1:0;

test('minimum uses raw scores for near, far and unknown candidates before choosing representatives',()=>{
 const input=[candidate(49.99,100,'low-near'),candidate(40,2000,'low-far'),candidate(30,null,'low-unknown'),candidate(50,450,'near'),candidate(55,1500,'far')];
 const r=rankNearby(input,[300,500],true,overlap);
 assert.deepEqual(r.selected.map(c=>c.score.raw),[50,55]);
 assert.equal(r.selected[0].approach.distanceM,450);
 assert.equal(r.proximity.defaultIndex,0);
 assert.equal(r.proximity.comparisonRequired,false);
 const higher=rankNearby([input[3],candidate(55.0001,1500,'far')],[300,500],true,overlap);
 assert.equal(higher.proximity.defaultIndex,null);assert.equal(higher.proximity.comparisonRequired,true);
});

test('minimum never fills missing slots; empty, far-only and unknown-only results do not auto-select',()=>{
 const empty=rankNearby([candidate(49.99,100,'a'),candidate(40,1200,'b')],[300,500,1000],true,overlap);
 assert.deepEqual(empty.selected,[]);assert.equal(empty.proximity.defaultIndex,null);assert.equal(empty.proximity.comparisonRequired,false);
 for(const distance of [1500,null]){
  const r=rankNearby([candidate(49,100,'low'),candidate(50,distance,'qualified')],[300,500,1000],distance!==null,overlap);
  assert.equal(r.selected.length,1);assert.equal(r.proximity.defaultIndex,null);
  assert.equal(r.selected[0].recommendation,distance===null?'unknown':'far');
 }
});

test('qualified candidates retain overlap removal and five-result limit',()=>{
 const pool=[candidate(49,100,'low'),candidate(60,200,'same'),candidate(70,1500,'same'),...Array.from({length:6},(_,i)=>candidate(59-i,500,`other-${i}`))];
 const r=rankNearby(pool,[300,500],true,overlap);
 assert.equal(r.selected.length,5);
 assert.equal(r.selected.filter(c=>c.usage.edges.has('same')).length,1);
 assert.ok(r.selected.some(c=>c.score.raw===70));assert.ok(r.selected.every(c=>c.score.raw>=50));
});

test('real nearby search expands beyond a low-score 300m candidate and returns no subminimum courses',()=>{
 const grid=JSON.parse(readFileSync('assets/route-lab/grid.json'));
 const options={version:'0.2',mode:'free-loop',shape:'heart',shapeVersion:'figma-20261024',maxRouteKm:20,targetKm:1,radiusKm:2};
 const graph=buildGraph(grid.elements,grid.origin,2000),legacy=search(graph,options),events=[];
 assert.ok(legacy.candidates.length);assert.ok(legacy.candidates.every(c=>c.score.raw<50));
 const result=search(graph,{...options,proximity:'nearby-v1'},e=>events.push(e));
 assert.deepEqual(result.proximity.stages,[300,500,1000]);assert.deepEqual(result.candidates,[]);
 assert.equal(result.proximity.defaultIndex,null);
 assert.deepEqual(result.baseline.candidates,legacy.baseline.candidates);
 const stages=events.filter(e=>e.phase==='nearby');assert.deepEqual(stages.map(e=>e.accessLimitM),[300,500,1000]);
 assert.match(stages[1].text,/300m 이내에서 유사도 기준.*500m/);
});
