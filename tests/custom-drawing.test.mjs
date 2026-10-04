import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { drawingTemplate, templatePreview, DRAWING_POINTS_MAX } from '../src/features/route-lab/drawing.ts';
import { createLabSession } from '../src/features/route-lab/session.ts';
import { courseFromCalculation } from '../src/features/route-lab/saved-course.ts';
import { buildGraph, search } from '../src/modules/route-engine/engine.ts';
import { validateInput } from '../src/modules/route-engine/runner.ts';
import { encodeSnapshot, decodeSnapshot, savedCourseOverlay } from '../src/modules/courses/model.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { createSyncRepository } from '../src/modules/sync/repository.ts';
import { decodePayload, digest } from '../src/modules/sync/model.ts';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { courseGpx } from '../src/modules/courses/gpx.ts';
import { makeSharedRun } from '../src/modules/run-sharing/model.ts';

const square = [{x:.15,y:.2},{x:.85,y:.2},{x:.85,y:.8},{x:.15,y:.8},{x:.15,y:.2}];
const grid = JSON.parse(fs.readFileSync('assets/route-lab/grid.json','utf8'));
const options = {...grid.options,shape:'custom',customTemplate:drawingTemplate(square),mode:'free-loop',radiusKm:2,targetKm:3};
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let computed;
function calculation() {
  computed ??= {origin:grid.origin,options,liveRoads:true,result:search(buildGraph(grid.elements,grid.origin,2000),options)};
  assert.ok(computed.result.candidates.length); return computed;
}
async function device(t) {
  const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);
  let now=1800000000000;
  return {db,courses:createCourseRepository(db,()=>now,()=>owner),runs:createRunRepository(db,()=>now,()=>owner),
    sync:createSyncRepository(db,()=>owner),time:()=>now,advance:ms=>{now+=ms;}};
}

test('drawing preserves corners and aspect ratio, flips screen y and owns its output',()=>{
  const input=structuredClone(square), result=drawingTemplate(input);
  assert.equal(result.length,5);assert.equal(result[0].x,-1);assert.ok(Math.abs(result[0].y-6/7)<1e-12);
  assert.deepEqual(result[0],result.at(-1));assert.notEqual(result[0],result.at(-1));
  input[0].x=.5;assert.equal(result[0].x,-1);
  const preview=templatePreview(result);assert.ok(preview[0].y<preview[2].y);
  const again=drawingTemplate(preview);
  for(let i=0;i<result.length;i++)assert.ok(Math.hypot(result[i].x-again[i].x,result[i].y-again[i].y)<1e-12);
});

test('normalization is translation/scale independent and closes only small gaps',()=>{
  const smaller=square.map(p=>({x:p.x*.7+.05,y:p.y*.7+.05}));
  const a=drawingTemplate(square),b=drawingTemplate(smaller);
  a.forEach((p,i)=>assert.ok(Math.hypot(p.x-b[i].x,p.y-b[i].y)<1e-12));
  const gap=structuredClone(square);gap.at(-1).y+=.025;
  const result=drawingTemplate(gap);assert.deepEqual(result[0],result.at(-1));
  assert.throws(()=>drawingTemplate(square.slice(0,-1)),/닫아/);
});

test('empty, line, tiny, crossing, nonfinite, out-of-bounds and huge strokes are rejected',()=>{
  for(const points of [[],[{x:.5,y:.5}],Array(5).fill({x:.5,y:.5}),
    [{x:.1,y:.1},{x:.5,y:.5},{x:.8,y:.8},{x:.1,y:.1}],
    square.map(p=>({x:p.x*.05,y:p.y*.05})),
    [{x:.1,y:.1},{x:.9,y:.9},{x:.9,y:.1},{x:.1,y:.9},{x:.1,y:.1}],
    [...square,{x:NaN,y:.2}],[...square,{x:1.01,y:.1}],Array(DRAWING_POINTS_MAX+1).fill(square[0])]) {
    assert.throws(()=>drawingTemplate(points));
  }
});

test('dense unevenly sampled handwriting simplifies to at most 49 closed engine points',()=>{
  const stroke=Array.from({length:1400},(_,i)=>{const a=i/1399*2*Math.PI;return {x:.5+.4*Math.cos(a),y:.5+.3*Math.sin(a)};});
  const template=drawingTemplate(stroke);assert.ok(template.length>=12&&template.length<=49);
  assert.deepEqual(template[0],template.at(-1));
  validateInput({...grid,options:{...options,customTemplate:template}});
  assert.throws(()=>validateInput({...grid,options:{...options,customTemplate:undefined}}),/도형/);
});

test('async road loading snapshots the original drawing and cancellation suppresses stale custom results',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});let received,success=0;
  const input=structuredClone({...grid,options});
  const session=createLabSession(async()=>{await pending;return {elements:grid.elements,source:'fixture',cached:true};},async value=>{received=value;return {result:{},metrics:{}};});
  const job=session.start({input,liveRoads:true},{progress(){},success:value=>{success++;assert.deepEqual(value.options.customTemplate,options.customTemplate);},error:e=>{throw e;}});
  input.options.customTemplate[0].x=9;input.options.shape='heart';release();await job;
  assert.deepEqual(received.options.customTemplate,options.customTemplate);assert.equal(received.options.shape,'custom');assert.equal(success,1);
  const late=createLabSession(async()=>({elements:[],source:'fixture',cached:true}),async()=>{await pending;return {};});
  const stale=late.start({input,liveRoads:false},{progress(){},success(){assert.fail('stale result');},error(){assert.fail('stale error');}});
  late.cancel();await stale;
});

test('custom free-loop calculation persists the actual drawing, route and road references in version 3',()=>{
  const completed=calculation(),snapshot=courseFromCalculation(completed,0),encoded=encodeSnapshot(snapshot);
  assert.equal(snapshot.schemaVersion,3);assert.equal(snapshot.shape,'custom');assert.deepEqual(snapshot.customTemplate,options.customTemplate);
  assert.equal(snapshot.roadSegments.length,snapshot.route.length-1);
  assert.deepEqual(decodeSnapshot(encoded.json,encoded.hash),snapshot);
  assert.deepEqual(savedCourseOverlay(snapshot).target.geometry.coordinates,snapshot.target);
  for(const change of [{customTemplate:[]},{customTemplate:null},{roadSegments:[]},{schemaVersion:2},{shape:'heart'}])assert.throws(()=>encodeSnapshot({...snapshot,...change}));
  assert.throws(()=>encodeSnapshot({...snapshot,schemaVersion:4}),{code:'newer-format'});
  const synthetic=courseFromCalculation({...completed,liveRoads:false},0);assert.equal(synthetic.source,'synthetic');
});

test('SQLite reopen/duplicate, course sync, run snapshot after deletion and run sync retain the drawing',async t=>{
  const a=await device(t),b=await device(t),snapshot=courseFromCalculation(calculation(),0);
  const saved=await a.courses.save(snapshot,'내 사각형'),duplicate=await a.courses.save(snapshot,'중복');
  assert.deepEqual(duplicate,{id:saved.id,created:false});
  const reopened=createCourseRepository(a.db,()=>a.time(),()=>owner);
  assert.deepEqual((await reopened.get(saved.id)).snapshot,snapshot);
  assert.match(courseGpx(await reopened.get(saved.id)).xml,/직접 그린 도형/);
  const restore=async pending=>{
    const hash=digest(pending.payload),remote={owner_id:owner,kind:pending.kind,record_id:pending.id,version:1,mutation_id:pending.mutationId,
      deleted:false,summary:pending.summary,payload_hash:hash,payload_path:`${owner}/${pending.kind}/${pending.id}/${hash}.json`};
    const decoded=decodePayload(remote,pending.payload);await b.sync.restore(owner,remote,pending.payload);return decoded;
  };
  await restore((await a.sync.pending(owner)).find(p=>p.kind==='course'));
  assert.deepEqual((await b.courses.get(saved.id)).snapshot,snapshot);
  const [longitude,latitude]=snapshot.route[0];
  const run=await a.runs.start(saved.id,{timestamp:a.time(),longitude,latitude,accuracy:5});
  a.advance(1000);await a.runs.append([{timestamp:a.time(),longitude,latitude,accuracy:5}]);
  a.advance(5000);await a.runs.append([{timestamp:a.time(),longitude:longitude+.0001,latitude,accuracy:5}]);
  a.advance(1000);await a.runs.transition(run.id,'completed');await a.courses.remove(saved.id);
  const pending=(await a.sync.pending(owner)).find(p=>p.kind==='run'),decoded=await restore(pending);
  assert.deepEqual(decoded.course.snapshot,snapshot);
  assert.deepEqual((await b.runs.guidance(run.id)).course.snapshot,snapshot);
  const share=makeSharedRun(await b.runs.get(run.id),await b.runs.points(run.id),decoded.course);
  assert.deepEqual(share.planned.target,snapshot.target);
});
