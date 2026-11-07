import test from 'node:test';
import assert from 'node:assert/strict';
import { achievementAwards } from '../src/modules/achievements/awards.ts';
import { currentPaceLabel } from '../src/modules/running/model.ts';
import { parseAchievementRegion } from '../src/modules/achievements/regions.ts';
const record=(id,extra={})=>({id,status:'completed',startedAt:1,distanceM:1000,activeMs:3600000,shape:'heart',courseId:'course',courseHash:'same',courseOutcome:'finished',targetKm:3,...extra});
const ids=rows=>achievementAwards(rows).map(x=>x.id);
test('approved time thresholds use 5, 50, 100, 500 hours and count each run once',()=>{
 for(const hours of [5,50,100,500]){
 const r=record('a',{activeMs:hours*3600000});assert.ok(ids([r,r]).includes(`time-${hours}`));assert.ok(!ids([record('b',{activeMs:hours*3600000-1})]).includes(`time-${hours}`));
 }
});
test('variation requires 3 targets or administrative regions of the same shape, finished only',()=>{
 const rows=[record('a',{targetKm:3,region:'city-a|dong-a'}),record('b',{targetKm:4,region:'city-a|dong-b'}),record('c',{targetKm:7,region:'city-b|dong-c'})];
 assert.ok(ids(rows).includes('distance-variation'));assert.ok(ids(rows).includes('region-variation'));
 assert.ok(!ids(rows.map(r=>({...r,targetKm:3,region:'city-a|dong-a'}))).includes('distance-variation'));
 assert.ok(!ids(rows.map((r,i)=>({...r,shape:['heart','star','dog'][i]}))).includes('region-variation'));
 assert.ok(!ids(rows.map(r=>({...r,courseOutcome:'stopped'}))).includes('distance-variation'));
 assert.ok(!ids(rows.slice(0,2)).includes('region-variation'));
});
test('category and collection badges follow approved shapes, repetitions do not grow collection',()=>{
 assert.ok(ids(['heart','star'].map((shape,i)=>record(String(i),{shape}))).includes('geometry'));
 assert.ok(ids(['icecream','crown','bone'].map((shape,i)=>record(String(i),{shape}))).includes('objects'));
 assert.ok(ids(['fish','whale','turtle','cat','dog'].map((shape,i)=>record(String(i),{shape}))).includes('animals'));
 assert.ok(!ids(Array.from({length:12},(_,i)=>record(String(i)))).includes('collection-3'));
 assert.ok(ids(Array.from({length:5},(_,i)=>record(String(i)))).includes('repeat-5'));
});
test('administrative region excludes road changes and requires known Korean administrative levels',()=>{
 const f=(id,text)=>({id,text});
 const result=parseAchievementRegion({features:[f('locality.2','역삼동'),f('municipality.1','강남구')]});
 assert.equal(result,'locality.2|municipality.1');
 assert.equal(parseAchievementRegion({features:[f('road.3','테헤란로')]}),null);
});
test('current pace uses recent accepted segment, ignores long gaps, stale fixes, and pause',()=>{
 const point=(t,lat,segment=0)=>({timestamp:t,latitude:lat,longitude:127,accuracy:5,segment,sequence:t});
 const path=[point(1000,37),point(6000,37.0001),point(11000,37.0002)];
 assert.notEqual(currentPaceLabel(path,12000),'—');assert.equal(currentPaceLabel(path,30000),'—');assert.equal(currentPaceLabel(path,12000,false),'—');
 assert.equal(currentPaceLabel([path[0],point(11000,37.0002,1)],12000),'—');assert.equal(currentPaceLabel([path[0],point(25000,37.0002)],26000),'—');
});

test('administrative cache preserves records, follows deletion, and fences an account switch during lookup',async t=>{
 const {openSqlite}=await import('./helpers/sqlite.mjs');
 const {migrateDatabase}=await import('../src/modules/storage/migrations.ts');
 const {createAchievementsRepository}=await import('../src/modules/achievements/repository.ts');
 const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);
 const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';let owner=A;
 const insert=async(id,who)=>db.runAsync(`INSERT INTO running_sessions(id,owner_id,status,started_at,checkpoint_at,resumed_at,course_id,course_outcome,course_snapshot_json,distance_m,active_ms) VALUES(?,?,'completed',1,1,1,'course','finished',?,3000,900000)`,id,who,JSON.stringify({shape:'heart',targetKm:3,origin:{lat:37,lng:127}}));
 await insert('1'.repeat(32),A);await insert('2'.repeat(32),B);
 const before=await db.getAllAsync('SELECT * FROM running_sessions ORDER BY id'),repo=createAchievementsRepository(db,()=>owner);
 await repo.resolveRegions(async()=>{owner=B;return 'municipality.1|locality.1';},new AbortController().signal);
 assert.equal((await db.getAllAsync('SELECT * FROM achievement_regions')).length,0);
 owner=A;await repo.resolveRegions(async()=> 'municipality.1|locality.1',new AbortController().signal);
 assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM achievement_regions WHERE owner_id=?',A)).n,1);
 assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM achievement_regions WHERE owner_id=?',B)).n,0);
 assert.deepEqual(await db.getAllAsync('SELECT * FROM running_sessions ORDER BY id'),before);
 await db.runAsync('DELETE FROM running_sessions WHERE id=?','1'.repeat(32));
 assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM achievement_regions')).n,0);
});
