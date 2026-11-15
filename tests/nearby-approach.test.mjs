import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AbortController as NativeAbortController} from 'abort-controller';
import {buildGraph,buildGraphSteps,search,toLatLng,toPoint} from '../src/modules/route-engine/engine.ts';
import {walkingFieldSteps,joinFromField,snapWalkingSourceSteps} from '../src/modules/route-engine/walking.ts';
import {createApproachPlanner,approachSteps,validApproach} from '../src/modules/running/approach.ts';
import {createApproachCache,handoffApproach} from '../src/modules/running/approach-cache.ts';
import {parseComputeRequest,parseComputeResponse} from '../src/modules/route-compute/contract.ts';
const finish=g=>{let r;do{r=g.next();}while(!r.done);return r.value;};
const origin={lat:37,lng:127},coord=([x,y])=>{const [lat,lng]=toLatLng({x,y},origin);return [lng,lat];};
const way=(id,nodes,points,tags={highway:'footway'})=>({type:'way',id,nodes,tags,geometry:points.map(p=>{const [lon,lat]=coord(p);return {lat,lon};})});
const loop=[[400,0],[600,0],[600,200],[400,200],[400,0]];
const roads=[way(1,[1,2],[[0,0],[400,0]]),way(2,[2,3,4,5,2],loop)];
const course={schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'diamond',origin,targetKm:1,lengthKm:.8,score:80,route:loop.map(coord),target:loop.map(coord)};
const request={course,position:coord([0,0]),accuracy:5};
const signal=()=>new AbortController().signal;
const ops={buildGraphSteps,approachSteps,validApproach,snapWalkingSourceSteps,toPoint};

test('nearby planner loads 1km once, shares simultaneous work and reuses a ready path',async()=>{
 let loads=0;const planner=createApproachPlanner(async()=>{loads++;await new Promise(r=>setTimeout(r,5));return {elements:roads,source:'test',cached:true};},async()=>{});
 const values=await Promise.all([planner(request,signal()),planner(request,signal())]);assert.deepEqual(values[0],values[1]);assert.equal(loads,1);assert.ok(Math.abs(values[0].distanceM-400)<1);
 let timing;await planner(request,signal(),value=>timing=value);assert.equal(loads,1);assert.equal(timing.cache,'plan');
 await planner({...request,targetM:100},signal());assert.equal(loads,1);
 const moved=await planner({...request,position:coord([50,0])},signal());assert.ok(Math.abs(moved.distanceM-350)<1);assert.equal(loads,1);planner.clear();assert.deepEqual(planner.stats(),{graphs:0,plans:0,pending:0});
});
test('expiry reloads roads; course changes never reuse a mismatched target',async()=>{
 let now=0,loads=0;const planner=createApproachCache(async()=>{loads++;return {elements:roads,source:'test',cached:true};},ops,async()=>{},()=>now);
 const first=await planner(request,signal());const second=await planner({...request,targetM:200},signal());assert.notEqual(first.targetM,second.targetM);assert.equal(loads,1);
 now=300001;await planner(request,signal());assert.equal(loads,2);
});
test('one subscriber cancelling does not abort the other; late cancelled work cannot populate caches',async()=>{
 let release;const planner=createApproachPlanner(async()=>{await new Promise(r=>release=r);return {elements:roads,source:'test',cached:true};},async()=>{});
 const cancel=new AbortController(),a=planner(request,cancel.signal),b=planner(request,signal());cancel.abort();await assert.rejects(a,/취소/);release();assert.ok((await b).distanceM>0);
 planner.clear();const controller=new AbortController(),c=planner(request,controller.signal);controller.abort();await assert.rejects(c,/취소/);release();await new Promise(r=>setTimeout(r,0));assert.equal(planner.stats().plans,0);
});
test('long boundary roads remain snappable and a real outside detour expands to 5km',async()=>{
 const detour=[way(1,[1,6,7,2],[[0,0],[0,2200],[400,2200],[400,0]]),roads[1]],radii=[];
 const planner=createApproachPlanner(async(_o,r)=>{radii.push(r);return {elements:detour,source:'test',cached:true};},async()=>{});
 const result=await planner(request,signal());assert.deepEqual(radii,[1000,2000,5000]);assert.ok(result.distanceM>4000);
});
test('nearby parallel roads are not accepted through a cached plan',async()=>{
 const other=way(3,[10,11],[[0,10],[300,10]]);const planner=createApproachPlanner(async()=>({elements:[...roads,other],source:'test',cached:true}),async()=>{});
 await planner(request,signal());await assert.rejects(planner({...request,position:coord([0,10])},signal()));
});
test('one-way approach distance field respects direction and joins the reachable side',()=>{
 const directed=[way(1,[1,2],[[0,0],[400,0]],{highway:'footway','oneway:foot':'-1'}),roads[1]];
 const graph=buildGraph(directed,origin,2000),field=finish(walkingFieldSteps(graph,{x:0,y:0},5));
 const ids=graph.nodes.filter(n=>n.x>399).map(n=>n.id);assert.equal(joinFromField(field,ids),null);
});
test('v3 adds actual nearby candidates without lowering the legacy global best and validates approach geometry',()=>{
 const grid=JSON.parse(fs.readFileSync('assets/route-lab/grid.json'));
 const options={version:'0.2',mode:'free-loop',shape:'heart',shapeVersion:'figma-20261024',maxRouteKm:20,targetKm:2,radiusKm:2};
 const graph=buildGraph(grid.elements,grid.origin,2000),baseline=search(graph,options),events=[];
 const result=search(graph,{...options,proximity:'nearby-v1'},event=>events.push(event));
 assert.ok(result.candidates.some(c=>c.approach?.distanceM<=300));assert.ok(Math.max(...result.candidates.map(c=>c.score.raw))>=baseline.candidates[0].score.raw);
 assert.deepEqual(result.proximity.stages,[300]);assert.equal(events.filter(e=>e.phase==='nearby').length,1);assert.ok(events.some(e=>e.phase==='comparison'));
 const req=parseComputeRequest({contract:'runpen-routes-v3',origin:grid.origin,options:{...options,proximity:'nearby-v1'},refresh:false});
 const response={contract:req.contract,request:req,result,metrics:{elapsedMs:1,computeMs:1,maxSliceMs:1,yields:0,nodes:1,edges:1,routing:{}},roads:{release:'test',manifestHash:'a'.repeat(64),cached:true},timing:{roadMs:0,calculationMs:1,totalMs:1}};
 assert.doesNotThrow(()=>parseComputeResponse(JSON.parse(JSON.stringify(response)),req));
 const broken=structuredClone(response);broken.result.candidates[0].approach.path.at(-1).x+=10;assert.throws(()=>parseComputeResponse(broken,req));
 for(const contract of ['runpen-routes-v1','runpen-routes-v2'])assert.throws(()=>parseComputeRequest({...req,contract}));
});

test('distance and raw-score boundaries control selection; far and unknown candidates never auto-select',async()=>{
 const {rankNearby}=await import('../src/modules/route-engine/nearby.ts');
 const c=(score,distance,id)=>({score:{raw:score},usage:{edges:new Map([[id,100]])},approach:distance===null?null:{distanceM:distance},recommendation:'unknown'});
 const overlap=(a,b)=>[...a.keys()].some(k=>b.has(k))?1:0;
 for(const [distance,expected] of [[300,0],[500,0],[1000,0],[1000.01,null]]){
  const {proximity}=rankNearby([c(80,distance,'a')],[300,500,1000],true,overlap);assert.equal(proximity.defaultIndex,expected);
 }
 for(const [gap,expected] of [[5,false],[5.0001,true]]){
  const r=rankNearby([c(80,200,'a'),c(80+gap,1500,'b')],[300],true,overlap);assert.equal(r.proximity.comparisonRequired,expected);assert.equal(r.proximity.defaultIndex,expected?null:0);assert.equal(r.selected[0].approach.distanceM,200);assert.equal(r.selected[1].recommendation,'far');
 }
 const unknown=rankNearby([c(99,null,'a')],[],false,overlap);assert.equal(unknown.proximity.defaultIndex,null);assert.equal(unknown.selected[0].recommendation,'unknown');
 const duplicate=rankNearby([c(80,200,'a'),c(90,1500,'a')],[300],true,overlap);assert.equal(duplicate.selected[0].score.raw,90);assert.equal(duplicate.proximity.defaultIndex,null);
});


test('screen handoff inherits an unfinished request; changed road data invalidates completed plans',async()=>{
 let release,loads=0;const planner=createApproachPlanner(async()=>{loads++;await new Promise(r=>release=r);return {elements:roads,source:'test',cached:true};},async()=>{});
 const screen=new NativeAbortController(),first=planner(request,screen.signal);handoffApproach(screen);await assert.rejects(first,/취소/);
 const next=planner(request,signal());release();await next;assert.equal(loads,1);
 planner.roadsChanged();assert.equal(planner.stats().plans,0);
 const updated=planner(request,signal());release();await updated;assert.equal(loads,2);
});

test('a road version update emitted by the loader does not cancel its own new calculation',async()=>{
 const planner=createApproachPlanner(async()=>{planner.roadsChanged();return {elements:roads,source:'test',cached:true};},async()=>{});
 assert.ok((await planner(request,signal())).distanceM>0);
});


test('a verified route just inside 1km does not trigger a redundant 2km lookup',async()=>{
 const radii=[],planner=createApproachPlanner(async(_o,r)=>{radii.push(r);return {elements:[way(1,[1,2],[[-550,0],[400,0]]),roads[1]],source:'test',cached:true};},async()=>{});
 const result=await planner({...request,position:coord([-550,0])},signal());assert.ok(result.distanceM>949&&result.distanceM<951);assert.deepEqual(radii,[1000]);
});


test('graph eviction also releases paths that retained an evicted graph',async()=>{
 const planner=createApproachPlanner(async()=>({elements:roads,source:'test',cached:true}),async()=>{});
 await planner(request,signal());assert.equal(planner.stats().plans,1);
 for(const x of [3000,6000])await assert.rejects(planner({...request,position:coord([x,0])},signal()));
 assert.equal(planner.stats().graphs,2);assert.equal(planner.stats().plans,0);
});


test('moving along a pedestrian one-way rebuilds the path on the shared graph instead of sending the runner backwards',async()=>{
 let loads=0;const planner=createApproachPlanner(async()=>{loads++;return {elements:[way(1,[1,2],[[0,0],[400,0]],{highway:'footway','oneway:foot':'yes'}),roads[1]],source:'test',cached:true};},async()=>{});
 await planner(request,signal());const result=await planner({...request,position:coord([10,0])},signal());
 assert.ok(Math.abs(result.distanceM-390)<1);assert.equal(loads,1);
});


test('coincident endpoints on disconnected levels remain ambiguous, while a real shared OSM junction is accepted',()=>{
 const base=way(11,[101,102],[[-100,0],[0,0]]),other=way(12,[103,104],[[0,-100],[0,0]]);
 assert.throws(()=>finish(snapWalkingSourceSteps(buildGraph([base,other],origin,1000),{x:0,y:0},5)),/도로가 겹쳐/);
 const connected={...other,nodes:[103,102]};assert.doesNotThrow(()=>finish(snapWalkingSourceSteps(buildGraph([base,connected],origin,1000),{x:0,y:0},5)));
});


test('a generation seed respects current GPS accuracy and recalculates when the actual origin differs',async()=>{
 let loads=0;const loader=async()=>{loads++;return {elements:roads,source:'test',cached:true};},source={way:1,from:1,to:2,start:0,end:.1,bidirectional:true},plan={path:[coord([0,0]),coord([400,0])],distanceM:400,targetM:0};
 const accurate=createApproachPlanner(loader,async()=>{}),offRoad={...request,position:coord([0,20])};
 accurate.seed({...offRoad,accuracy:30},plan,source,'unversioned');await assert.rejects(accurate(offRoad,signal()),/보행 도로 위/);assert.equal(loads,1);
 const planner=createApproachPlanner(loader,async()=>{});planner.seed(request,plan,source,'unversioned');await planner(request,signal());assert.equal(loads,1);
 const moved=await planner({...request,position:coord([.5,0])},signal());assert.ok(Math.abs(moved.distanceM-399.5)<.1);assert.equal(loads,2);
});
