import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeCatalog,badgeProgress } from '../src/modules/achievements/catalog.ts';
import { achievementAwards } from '../src/modules/achievements/awards.ts';
import { createAchievementsRepository } from '../src/modules/achievements/repository.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { encodeSnapshot } from '../src/modules/courses/model.ts';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { openSqlite } from './helpers/sqlite.mjs';
import { regionLabel } from '../src/modules/map/region-label.ts';
const BASE=1800000000000,A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const row=(i,extra={})=>({id:String(i),status:'completed',startedAt:BASE+i*1000,distanceM:3000,activeMs:900000,courseId:'course',courseOutcome:'finished',shape:'heart',targetKm:3,courseHash:'same',region:null,courseName:'course',reason:null,originLat:37,originLng:127,...extra});
const progress=(records,id)=>badgeProgress(records).find(b=>b.definition.id===id);
test('all 29 design badges exist from zero records, locked and without fabricated dates/evidence',()=>{
 const badges=badgeProgress([]);assert.equal(badges.length,29);assert.equal(new Set(badges.map(b=>b.definition.id)).size,29);
 for(const b of badges){assert.equal(b.earned,false);assert.equal(b.progress,0);assert.equal(b.earnedAt,null);assert.deepEqual(b.runIds,[]);}
});
test('first shape, collection and approved categories require distinct finished shapes, not stopped/custom records',()=>{
 const records=['heart','star','icecream','crown','bone','fish','whale','turtle','cat','dog'].map((shape,i)=>row(i,{shape}));
 assert.equal(progress(records,'geometry').earned,true);assert.equal(progress(records,'objects').earned,true);assert.equal(progress(records,'animals').earned,true);
 assert.equal(progress(records,'collection-6').earned,true);assert.equal(progress(records,'collection-12').earned,false);
 assert.deepEqual(progress(records,'collection-3').runIds,['0','1','2']);
 assert.equal(progress([row(1),row(2)],'heart').earnedAt,BASE+1000);
 assert.equal(progress([row(1,{courseOutcome:'stopped'}),row(2,{shape:'custom'})],'heart').earned,false);
 const publicAwards=new Set(achievementAwards(records).map(a=>a.id));
 for(const b of badgeProgress(records).filter(b=>b.definition.kind!=='shape'))assert.equal(b.earned,publicAwards.has(b.definition.id));
});
test('variation uses three actual targets or known administrative regions of one shape; repeated same values do not count',()=>{
 const records=[row(1,{targetKm:3,region:'city1|dong1'}),row(2,{targetKm:4,region:'city1|dong2'}),row(3,{targetKm:5,region:'city2|dong3'})];
 assert.equal(progress(records,'distance-variation').earned,true);assert.equal(progress(records,'region-variation').earned,true);
 assert.deepEqual(progress(records,'region-variation').runIds,['1','2','3']);
 assert.equal(progress(records.map(r=>({...r,targetKm:3,region:null})),'region-variation').earned,false);
 assert.equal(progress(records.map((r,i)=>({...r,shape:['heart','star','fish'][i]})),'distance-variation').earned,false);
 assert.equal(progress(records.slice(0,2),'distance-variation').progress,2);
});
test('repeat badge groups by immutable course hash, records deduplicate, and deletion recomputes the first award',()=>{
 const rows=Array.from({length:5},(_,i)=>row(i));assert.equal(progress([...rows,rows[0]],'repeat-5').progress,5);
 assert.equal(progress(rows.slice(1),'repeat-5').earned,false);assert.equal(progress(rows.slice(1),'heart').earnedAt,BASE+1000);
 assert.equal(progress(rows.map((r,i)=>({...r,courseHash:String(i)})),'repeat-5').earned,false);
});
test('cumulative distance and time retain the approved exact thresholds and include ended stopped runs only',()=>{
 for(const km of [10,50,100,300]){const id='distance-'+km;assert.equal(progress([row(1,{distanceM:km*1000-1})],id).earned,false);assert.equal(progress([row(1,{distanceM:km*1000,courseOutcome:'stopped'})],id).earned,true);}
 for(const hours of [5,50,100,500]){const id='time-'+hours;assert.equal(progress([row(1,{activeMs:hours*3600000-1})],id).earned,false);assert.equal(progress([row(1,{activeMs:hours*3600000})],id).earned,true);}
 assert.equal(progress([row(1,{status:'paused',distanceM:500000,activeMs:1000000000})],'distance-10').progress,0);
});
test('gallery uses owned small summaries and rejects an account switch before returning private data',async t=>{
 const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);let owner=A;
 for(const [i,who,shape] of [[1,A,'heart'],[2,B,'fish']])await db.runAsync("INSERT INTO running_sessions(id,owner_id,status,started_at,ended_at,checkpoint_at,resumed_at,course_id,course_name,course_outcome,course_snapshot_json,distance_m,active_ms) VALUES(?,?,'completed',1,1001,1001,1,'course','test','finished',?,3000,1000)",String(i).repeat(32),who,JSON.stringify({shape,origin:{lat:37,lng:127},targetKm:3}));
 const before=await db.getAllAsync('SELECT * FROM running_sessions ORDER BY id');
 const repo=createAchievementsRepository(db,()=>owner),one=await repo.gallery();assert.deepEqual(one.records.map(r=>r.id),['1'.repeat(32)]);assert.equal(one.badges.find(b=>b.definition.id==='heart').earned,true);
 owner=B;assert.deepEqual((await repo.gallery()).records.map(r=>r.id),['2'.repeat(32)]);
 owner=A;const fenced={...db,withExclusiveTransactionAsync:task=>db.withExclusiveTransactionAsync(tx=>task({...tx,getAllAsync:async(...args)=>{const rows=await tx.getAllAsync(...args);owner=B;return rows;}}))};
 await assert.rejects(createAchievementsRepository(fenced,()=>owner).gallery(),/계정/);
 assert.deepEqual(await db.getAllAsync('SELECT * FROM running_sessions ORDER BY id'),before);
});
test('renaming a completed record keeps its saved course unchanged and never renames another owner record',async t=>{
 const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);
 const snapshot={schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:3,lengthKm:3,score:80,route:[[127,37],[127.002,37],[127,37]],target:[[127,37],[127.002,37],[127,37]]};
 const courses=createCourseRepository(db,()=>BASE,()=>A),course=await courses.save(snapshot,'saved original'),encoded=encodeSnapshot(snapshot),id='1'.repeat(32);
 await db.runAsync("INSERT INTO running_sessions(id,owner_id,status,started_at,ended_at,checkpoint_at,resumed_at,course_id,course_name,course_outcome,course_snapshot_json,course_snapshot_hash,active_ms) VALUES(?,?,'completed',1,1001,1001,1,?,'record original','finished',?,?,1000)",id,A,course.id,encoded.json,encoded.hash);
 const repo=createRunRepository(db,()=>BASE,()=>A);await repo.renameCourseRecord(id,'record edited');assert.equal((await repo.get(id)).courseName,'record edited');assert.equal((await courses.get(course.id)).name,'saved original');
 await assert.rejects(createRunRepository(db,()=>BASE,()=>B).renameCourseRecord(id,'wrong owner'));
 assert.equal((await repo.get(id)).courseName,'record edited');
});
test('administrative labels come from the saved point response, exclude country/road names and deduplicate context',()=>{
 const context=[{id:'region.1',text:'서울특별시'},{id:'municipality.2',text:'강남구'},{id:'country.1',text:'대한민국'}];
 assert.equal(regionLabel({features:[{id:'locality.3',text:'역삼동',context}]}),'서울특별시 강남구 역삼동');
 assert.equal(regionLabel({features:[{id:'road.1',text:'테헤란로'}]}),null);
 assert.equal(regionLabel(null),null);
});
