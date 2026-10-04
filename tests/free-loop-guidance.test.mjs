import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLoopGuidance,loopAt } from '../src/modules/guidance/loop-engine.ts';
import { prepareRoute,positionAt,offset,distance } from '../src/modules/guidance/geometry.ts';
import { buildGraph,search,toLatLng,routeReferences } from '../src/modules/route-engine/engine.ts';
import { approachSteps,createApproachPlanner } from '../src/modules/running/approach.ts';
import { encodeSnapshot } from '../src/modules/courses/model.ts';
import { courseFromCalculation } from '../src/features/route-lab/saved-course.ts';
import { startReadiness,createRunGuidance } from '../src/modules/running/guidance.ts';
import { createGuidance } from '../src/modules/guidance/engine.ts';
import { calculateRoute,CalculationCancelled } from '../src/modules/route-engine/runner.ts';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { createRunController } from '../src/modules/running/controller.ts';
import { createSyncRepository } from '../src/modules/sync/repository.ts';
import { decodePayload,digest } from '../src/modules/sync/model.ts';

const origin={lat:37,lng:127},coord=p=>{const [lat,lng]=toLatLng({x:p[0],y:p[1]},origin);return [lng,lat];};
const square=[[0,0],[200,0],[200,200],[0,200],[0,0]].map(coord);
const snapshot=route=>({schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'diamond',origin,targetKm:1,lengthKm:prepareRoute(route).totalMeters/1000,score:80,route,target:route});
const way=(id,nodes,points,tags={highway:'footway'})=>({type:'way',id,nodes,geometry:points.map(p=>{const [lon,lat]=coord(p);return {lat,lon};}),tags});
const finish=g=>{let n=g.next();while(!n.done)n=g.next();return n.value;};
function stream(route,initial=0,direction=1){
  let engine=createLoopGuidance(route),time=0;
  const lap=loopAt(prepareRoute(route),initial,direction);
  function fix(position,accuracy=5,dt=1000){time+=dt;const state=engine.ingest({position,timestamp:time,accuracy});engine=createLoopGuidance(route,engine.checkpoint());return state;}
  for(let i=0;i<5;i++)fix(lap.points[0]);
  return {fix,engine:()=>engine,lap,at:m=>fix(positionAt(lap,m)),time:()=>time};
}

for(const start of [0,83,200,511])for(const dir of [1,-1])test(`one complete cyclic lap from ${start}m in direction ${dir}, with persistence each fix`,()=>{
  const s=stream(square,start,dir);
  for(let m=3;m<=s.lap.totalMeters;m+=3)s.at(m);
  for(let i=0;i<6;i++)s.at(s.lap.totalMeters);
  assert.equal(s.engine().snapshot().status,'arrived');assert.equal(s.engine().checkpoint().direction,dir);
  assert.equal(s.engine().checkpoint().finished,true);
  assert.ok(distance(s.engine().snapshot().lapStart,s.lap.points[0])<1);
});
test('reverse movement and a return to the start cannot substitute for the unseen half of the course',()=>{
  const s=stream(square,83,1);for(let m=3;m<=150;m+=3)s.at(m);
  const before=s.engine().snapshot().progressM;
  for(let m=147;m>=0;m-=3)s.at(m);
  for(let i=0;i<6;i++)s.at(0);
  assert.equal(s.engine().snapshot().progressM,before);assert.notEqual(s.engine().snapshot().status,'arrived');
  for(let m=3;m<=s.lap.totalMeters;m+=3)s.at(m);for(let i=0;i<6;i++)s.at(s.lap.totalMeters);
  assert.equal(s.engine().snapshot().status,'arrived');
});
test('GPS gap requires rejoining the last accepted occurrence, without granting skipped progress',()=>{
  const s=stream(square);for(let m=3;m<=100;m+=3)s.at(m);const before=s.engine().snapshot().progressM;
  s.fix(positionAt(s.lap,400),5,60000);
  assert.equal(s.engine().snapshot().progressM,before);assert.equal(s.engine().snapshot().phase,'return');
  assert.ok(s.engine().navigationRequest());
  for(let i=0;i<6;i++)s.fix(positionAt(s.lap,before));
  assert.equal(s.engine().snapshot().phase,'lap');
});
test('continuing preserves completed status and does not emit another arrival',()=>{
  const s=stream(square);for(let m=3;m<s.lap.totalMeters;m+=3)s.at(m);for(let i=0;i<6;i++)s.at(s.lap.totalMeters);
  s.engine().resume();for(let i=0;i<10;i++)s.at(s.lap.totalMeters);
  assert.equal(s.engine().snapshot().phase,'continued');assert.equal(s.engine().checkpoint().finished,true);
});
test('crossing and repeated-edge courses keep occurrence order',()=>{
  for(const coords of [[[0,0],[180,180],[0,180],[180,0],[0,0]],[[0,0],[0,220],[180,220],[180,100],[180,220],[0,220],[0,0]]]){
    const route=coords.map(coord),s=stream(route,40,1);
    for(let m=3;m<s.lap.totalMeters;m+=3){s.at(m);assert.ok(s.engine().snapshot().progressM<=m+2);}
    for(let i=0;i<6;i++)s.at(s.lap.totalMeters);
    assert.equal(s.engine().snapshot().status,'arrived');
  }
});
test('jitter at the join cannot lock a direction or finish; inaccurate GPS cannot advance',()=>{
  const s=stream(square);for(let i=0;i<60;i++)s.fix(offset(square[0],Math.sin(i)*4,Math.cos(i)*4));
  assert.equal(s.engine().snapshot().progressM,0);
  s.fix(square[2],60);assert.equal(s.engine().snapshot().status,'weak');assert.equal(s.engine().snapshot().progressM,0);
});
test('legacy running checkpoint remains the forward-only engine; open courses reject new loop starts',()=>{
  const open=square.slice(0,3),old=createGuidance(open);
  const engine=createRunGuidance(open,old.checkpoint());assert.equal(engine.checkpoint().version,1);
  assert.throws(()=>createLoopGuidance(open),/순환/);
  assert.equal(startReadiness({snapshot:snapshot(open)},{timestamp:10,longitude:127,latitude:37,accuracy:5},10).ready,false);
});
test('road distance chooses a reachable course edge rather than the geometrically nearest one',()=>{
  // The nearby left side is reached through a long detour. The direct road
  // leads to the far side, so the shortest destination is not nearest in space.
  const roads=[way(1,[1,2,3,4,1],[[0,0],[200,0],[200,200],[0,200],[0,0]]),
    way(2,[5,6,1],[[-50,100],[-400,0],[0,0]]),way(3,[5,3],[[-50,100],[200,200]])];
  const graph=buildGraph(roads,origin,2000),c=snapshot(square),p=finish(approachSteps(graph,{course:c,position:coord([-50,100]),accuracy:5}));
  assert.ok(distance(p.path.at(-1),square[2])<1);assert.ok(p.distanceM>260&&p.distanceM<280);
});
test('approach can end on a course edge interior, and respects pedestrian one-way',()=>{
  const roads=[way(1,[1,2],[[0,0],[200,0]]),way(2,[2,3,4,1],[[200,0],[200,200],[0,200],[0,0]])];
  const graph=buildGraph(roads,origin,2000),p=finish(approachSteps(graph,{course:snapshot(square),position:coord([83,0]),accuracy:5}));
  assert.ok(p.distanceM<1);assert.ok(distance(p.path.at(-1),coord([83,0]))<1);
  const directed=buildGraph([way(10,[8,1],[[-100,0],[0,0]],{highway:'footway','oneway:foot':'-1'}),...roads],origin,2000);
  assert.throws(()=>finish(approachSteps(directed,{course:snapshot(square),position:coord([-100,0]),accuracy:5})),/연결/);
});
test('OSM references prevent a same-coordinate disconnected bridge from joining the course',()=>{
  const roads=[way(1,[1,2,3,4,1],[[0,0],[200,0],[200,200],[0,200],[0,0]])];
  const graph=buildGraph(roads,origin,2000),ids=[];
  for(let edge=0;edge<graph.edges.length;edge++){const e=graph.edges[edge];if(!ids.length)ids.push(e.a);ids.push(e.b);}
  const route=ids.map(id=>{const n=graph.nodes[id];return coord([n.x,n.y]);});
  const course={...snapshot(route),schemaVersion:2,roadSegments:routeReferences(graph,ids)};
  const disconnected=buildGraph([way(20,[20,21,22],[[-100,-50],[0,0],[200,0]])],origin,2000);
  assert.throws(()=>finish(approachSteps(disconnected,{course,position:coord([-100,-50]),accuracy:5})),/코스/);
  assert.equal(encodeSnapshot(course).snapshot.schemaVersion,2);
});
test('road planner caps the radius at 10km, preserves offline errors, and supports cancellation',async()=>{
  const calls=[],load=async(_,radius)=>{calls.push(radius);return {elements:[],source:'fixture',cached:true};};
  await assert.rejects(createApproachPlanner(load)({course:snapshot(square),position:square[0],accuracy:5},new AbortController().signal));
  assert.deepEqual(calls,[2000,5000,10000]);
  const cancel=new AbortController();cancel.abort();await assert.rejects(createApproachPlanner(load)({course:snapshot(square),position:square[0],accuracy:5},cancel.signal),/취소/);
  assert.equal(calls.length,3);
  await assert.rejects(createApproachPlanner(async()=>{throw new Error('offline missing');})({course:snapshot(square),position:square[0],accuracy:5},new AbortController().signal),/offline missing/);
});
test('free-loop search works without a central road and persists only a reversible closed loop',()=>{
  const fixture=JSON.parse(fs.readFileSync('assets/route-lab/grid.json','utf8'));
  const graph=buildGraph(fixture.elements,fixture.origin,2000);
  for(const n of graph.nodes)if(Math.hypot(n.x,n.y)<180)n.links=[];
  const result=search(graph,{...fixture.options,targetKm:3,radiusKm:2,mode:'free-loop'});
  assert.ok(result.candidates.length);assert.equal(result.mode,'free-loop');
  for(const c of result.candidates){assert.equal(c.accessKm,0);assert.deepEqual(c.route,c.loop);assert.ok(c.roadSegments.every(r=>r.bidirectional));assert.ok(c.score.lengthKm>=2.25&&c.score.lengthKm<=3.75);}
  const saved=courseFromCalculation({origin:fixture.origin,options:fixture.options,result,liveRoads:true},0);
  assert.equal(saved.schemaVersion,2);assert.deepEqual(encodeSnapshot(saved).snapshot,saved);
});
test('a disconnected central road does not hide a remote component, and one-way-only loops are excluded',()=>{
  const roads=[way(1,[1,2],[[-30,0],[30,0]])];let id=10;
  const n=9,point=(x,y)=>[400+x*100,-400+y*100],node=(x,y)=>100+y*n+x;
  for(let y=0;y<n;y++)roads.push(way(id++,Array.from({length:n},(_,x)=>node(x,y)),Array.from({length:n},(_,x)=>point(x,y))));
  for(let x=0;x<n;x++)roads.push(way(id++,Array.from({length:n},(_,y)=>node(x,y)),Array.from({length:n},(_,y)=>point(x,y))));
  const options={version:'0.2',shape:'diamond',targetKm:1.5,radiusKm:2,mode:'free-loop'};
  const result=search(buildGraph(roads,origin,2000),options);
  assert.ok(result.candidates.length);assert.ok(result.candidates.every(c=>c.route.every(p=>p.x>300)));
  const oneWay=roads.map(r=>({...r,tags:{...r.tags,'oneway:foot':'yes'}}));
  assert.equal(search(buildGraph(oneWay,origin,2000),options).candidates.length,0);
});
for(const phase of ['graph','placement','routing','refine'])test(`free-loop calculation cancels during ${phase}`,async()=>{
  const input=JSON.parse(fs.readFileSync('assets/route-lab/grid.json','utf8'));input.options.mode='free-loop';
  const cancel=new AbortController();
  await assert.rejects(calculateRoute(input,{signal:cancel.signal,onProgress:p=>{if(p.phase===phase)cancel.abort();}}),CalculationCancelled);
});
test('version 2 road identities survive course sync and reject malformed direction or segment counts',async t=>{
  const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);
  const graph=buildGraph([way(1,[1,2,3,4,1],[[0,0],[200,0],[200,200],[0,200],[0,0]])],origin,2000);
  const ids=[graph.edges[0].a,...graph.edges.map(e=>e.b)],route=ids.map(i=>coord([graph.nodes[i].x,graph.nodes[i].y]));
  const value={...snapshot(route),schemaVersion:2,roadSegments:routeReferences(graph,ids)};
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const course=await createCourseRepository(db,()=>1000,()=>owner).save(value,'양방향 도로');
  const pending=(await createSyncRepository(db,()=>owner).pending(owner)).find(p=>p.id===course.id);
  const remote={owner_id:owner,kind:'course',record_id:course.id,version:1,mutation_id:pending.mutationId,deleted:false,summary:pending.summary,payload_hash:digest(pending.payload),payload_path:`${owner}/course/${course.id}/${digest(pending.payload)}.json`};
  assert.deepEqual(decodePayload(remote,pending.payload).snapshot,value);
  const second=openSqlite();t.after(()=>second.closeAsync());await migrateDatabase(second);
  await createSyncRepository(second,()=>owner).restore(owner,remote,pending.payload);
  assert.deepEqual((await createCourseRepository(second,()=>1000,()=>owner).get(course.id)).snapshot,value);
  assert.throws(()=>encodeSnapshot({...value,roadSegments:value.roadSegments.slice(1)}));
  assert.throws(()=>encodeSnapshot({...value,roadSegments:value.roadSegments.map(r=>({...r,bidirectional:false}))}));
});
test('approach GPS is recorded but contributes zero lap progress; stale plans cannot start a session',async t=>{
  const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);let now=100000;
  const courses=createCourseRepository(db,()=>now),runs=createRunRepository(db,()=>now),course=await courses.save(snapshot(square),'loop');
  const pos=coord([-60,0]),gps=p=>({timestamp:now,longitude:p[0],latitude:p[1],accuracy:5});
  const plan={path:[pos,square[0]],targetM:0,distanceM:60};
  await assert.rejects(runs.start(course.id,gps(coord([-150,0])),plan));assert.equal(await runs.active(),null);
  const run=await runs.start(course.id,gps(pos),plan);
  for(let i=0;i<10;i++){now+=1000;await runs.append([gps(coord([-60+i*3,0]))]);}
  assert.ok((await runs.get(run.id)).distanceM>20);assert.equal((await runs.guidance(run.id)).state.progressM,0);
  assert.equal((await runs.guidance(run.id)).state.phase,'approach');
});
test('canceling slow preparation creates no run or GPS service',async t=>{
  const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);
  const courses=createCourseRepository(db),runs=createRunRepository(db),course=await courses.save(snapshot(square),'loop');
  let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);let starts=0;
  const pos=coord([-60,0]),driver={prepare:async()=>{},locate:async()=>({timestamp:Date.now(),longitude:pos[0],latitude:pos[1],accuracy:5}),start:async()=>starts++,stop:async()=>{},healthy:async()=>true};
  const controller=createRunController(async()=>runs,driver,async()=>{entered();await gate;return {path:[pos,square[0]],targetM:0,distanceM:60};});
  const starting=controller.start(course.id);await ready;controller.cancelPreparation();release();
  await assert.rejects(starting,/취소/);assert.equal(await runs.active(),null);assert.equal(starts,0);
});
test('canceling during permission preparation also prevents a run from being created',async t=>{
  const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);const runs=createRunRepository(db);
  let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);let started=false;
  const controller=createRunController(async()=>runs,{prepare:async()=>{entered();await gate;},start:async()=>{started=true;},stop:async()=>{},healthy:async()=>true});
  const result=controller.start();await ready;controller.cancelPreparation();release();await assert.rejects(result,/취소/);
  assert.equal(await runs.active(),null);assert.equal(started,false);
});
test('a slow return-path request never blocks GPS writes, and a late result cannot overwrite a resumed run',async t=>{
  const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);let now=Date.now();
  const courses=createCourseRepository(db,()=>now),runs=createRunRepository(db,()=>now),course=await courses.save(snapshot(square),'loop');
  const gps=p=>({timestamp:now,longitude:p[0],latitude:p[1],accuracy:5});
  let release,entered;const gate=new Promise(r=>release=r),requested=new Promise(r=>entered=r);
  const controller=createRunController(async()=>runs,{prepare:async()=>{},locate:async()=>gps(square[0]),start:async()=>{},stop:async()=>{},healthy:async()=>true},async request=>{
    entered();await gate;return {path:[request.position,positionAt(prepareRoute(square),request.targetM)],targetM:request.targetM,distanceM:100};
  });
  const run=await controller.start(course.id);
  for(let i=0;i<5;i++){now+=1000;await controller.ingest([gps(square[0])]);}
  for(let m=3;m<=60;m+=3){now+=1000;await controller.ingest([gps(positionAt(prepareRoute(square),m))]);}
  for(let m=3;m<=60;m+=3){now+=1000;await controller.ingest([gps(offset(positionAt(prepareRoute(square),60),0,-m))]);}
  await requested;
  const before=await runs.get(run.id);now+=1000;await controller.ingest([gps(offset(positionAt(prepareRoute(square),60),0,-65))]);
  assert.ok((await runs.get(run.id)).pointCount>before.pointCount,'GPS persisted while navigation is still pending');
  await controller.pause(run.id);await controller.resume(run.id);const saved=(await runs.guidance(run.id)).checkpoint;
  release();await new Promise(r=>setTimeout(r,10));
  assert.deepEqual((await runs.guidance(run.id)).checkpoint,saved,'aborted old navigation cannot update new episode');
});
