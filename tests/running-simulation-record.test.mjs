import test from 'node:test';
import assert from 'node:assert/strict';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { createSyncRepository } from '../src/modules/sync/repository.ts';
import { decodePayload,digest } from '../src/modules/sync/model.ts';
import { readAchievements } from '../src/modules/achievements/repository.ts';
import { createRunningSimulation } from '../src/modules/running/simulation.ts';
import { buildSimulationRecord,isSimulationRun } from '../src/modules/running/simulation-record.ts';
import { runFinishDestination } from '../src/modules/running/finish-destination.ts';
import { offset } from '../src/modules/guidance/geometry.ts';
const BASE=1800000000000,owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const route=[[0,0],[0,240],[240,240],[240,0],[0,0]].map(([x,y])=>offset([127,37],x,y));
const snapshot={schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:3,lengthKm:3,score:80,route,target:route};
async function fixture(t){const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);const scope={owner};const runs=createRunRepository(db,()=>BASE,()=>scope.owner),courses=createCourseRepository(db,()=>BASE,()=>scope.owner);const course=await courses.save(snapshot,'Recorded simulation');return {db,runs,courses,course,scope};}
function simulation(complete=true){const s=createRunningSimulation(route);s.play(0);for(let clock=100;clock<60000;clock+=100){const state=s.update(clock);if(!complete||state.status==='arrived')break;}return s;}
test('production completion saves archive/first badge and syncs provenance exactly once',async t=>{
 const f=await fixture(t),s=simulation(),id=await f.runs.newSimulationId();assert.equal(s.snapshot().status,'arrived');
 const run=await f.runs.saveSimulation({id,courseId:f.course.id,...s.recording()},owner);
 assert.equal(run.courseOutcome,'finished');assert.ok(isSimulationRun(run));assert.ok(run.distanceM>900);assert.equal(run.endedAt,BASE);assert.ok(run.startedAt<BASE);
 assert.equal(runFinishDestination(run).pathname,'/run-result');assert.equal((await f.runs.finished()).length,1);assert.equal(await f.runs.active(),null);
 assert.ok((await readAchievements(f.db,owner,BASE)).badges.some(b=>b.shape==='heart'&&b.firstRunId===id));
 await f.runs.saveSimulation({id,courseId:f.course.id,...s.recording()},owner);assert.equal((await f.runs.finished()).length,1);
 const pending=(await createSyncRepository(f.db,()=>owner).pending(owner)).find(row=>row.kind==='run');assert.ok(pending);
 const hash=digest(pending.payload),remote={owner_id:owner,kind:'run',record_id:id,version:1,mutation_id:pending.mutationId,deleted:false,summary:pending.summary,payload_path:`${owner}/run/${id}/${hash}.json`,payload_hash:hash};
 const decoded=decodePayload(remote,pending.payload);assert.ok(decoded.course);assert.ok(isSimulationRun(pending.summary));
 const other=openSqlite();t.after(()=>other.closeAsync());await migrateDatabase(other);await createSyncRepository(other,()=>owner).restore(owner,remote,pending.payload);
 assert.ok(isSimulationRun(await createRunRepository(other,()=>BASE,()=>owner).get(id)));
});
test('early stop is not a finish or badge; account fences and active real runs prevent writes',async t=>{
 const f=await fixture(t),s=simulation(false),id=await f.runs.newSimulationId();
 await assert.rejects(f.runs.saveSimulation({id,courseId:f.course.id,...s.recording()},'other'));
 const run=await f.runs.saveSimulation({id,courseId:f.course.id,...s.recording()},owner);assert.equal(run.courseOutcome,'stopped');assert.equal(runFinishDestination(run).pathname,'/courses');
 assert.equal((await f.runs.finished()).length,0);assert.equal((await readAchievements(f.db,owner,BASE)).badges.length,0);
 await f.runs.start();await assert.rejects(f.runs.saveSimulation({id:await f.runs.newSimulationId(),courseId:f.course.id,...s.recording()},owner),/실제/);
});
test('invalid virtual fixes roll back rather than manufacturing completion',async t=>{
 const f=await fixture(t),id=await f.runs.newSimulationId(),course={id:f.course.id,name:'test',snapshot};
 assert.throws(()=>buildSimulationRecord(id,course,[{timestamp:0,position:[NaN,37],accuracy:5}],1000,BASE));
 await assert.rejects(f.runs.saveSimulation({id,courseId:f.course.id,fixes:[{timestamp:2000,position:route[0],accuracy:5}],elapsedMs:1000},owner));
 assert.equal(await f.db.getFirstAsync('SELECT id FROM running_sessions'),null);
});

test('a newly finished simulation supersedes an older stop despite its earlier virtual start',async t=>{
 const f=await fixture(t),oldRuns=createRunRepository(f.db,()=>BASE-1000,()=>owner);
 const stopped=await oldRuns.saveSimulation({id:await oldRuns.newSimulationId(),courseId:f.course.id,...simulation(false).recording()},owner);
 assert.equal((await f.courses.list())[0].unfinished,true);
 const completed=await f.runs.saveSimulation({id:await f.runs.newSimulationId(),courseId:f.course.id,...simulation().recording()},owner);
 assert.ok(completed.startedAt<stopped.startedAt);assert.ok(completed.endedAt>stopped.endedAt);
 const hash=(await f.db.getFirstAsync('SELECT snapshot_hash FROM saved_courses WHERE id=?',f.course.id)).snapshot_hash;
 assert.equal((await f.courses.latestAttempt(f.course.id,hash)).id,completed.id);
 assert.equal((await f.courses.latestAttempt(null,hash)).id,completed.id);
 assert.equal((await f.courses.list())[0].unfinished,false);
 assert.equal((await f.courses.list())[0].inProgress,false);
 const laterRuns=createRunRepository(f.db,()=>BASE+1000,()=>owner);
 const later=await laterRuns.saveSimulation({id:await laterRuns.newSimulationId(),courseId:f.course.id,...simulation(false).recording()},owner);
 assert.equal((await f.courses.latestAttempt(f.course.id,hash)).id,later.id);
 assert.equal((await f.courses.list())[0].unfinished,true);
 assert.equal((await f.courses.list())[0].inProgress,false);
});

test('an active attempt takes precedence over ended records even with an earlier clock',async t=>{
 const f=await fixture(t);
 await f.runs.saveSimulation({id:await f.runs.newSimulationId(),courseId:f.course.id,...simulation().recording()},owner);
 const activeRuns=createRunRepository(f.db,()=>BASE-2000,()=>owner);
 const active=await activeRuns.start(f.course.id,{timestamp:BASE-2000,latitude:route[0][1],longitude:route[0][0],accuracy:5});
 const hash=(await f.db.getFirstAsync('SELECT snapshot_hash FROM saved_courses WHERE id=?',f.course.id)).snapshot_hash;
 assert.equal((await f.courses.latestAttempt(f.course.id,hash)).id,active.id);
 assert.equal((await f.courses.list())[0].inProgress,true);
});

test('an unfinished simulation resumes the old orange trace and progress, completes and keeps the old attempt immutable',async t=>{
 const f=await fixture(t),s=createRunningSimulation(route);s.play(0);s.update(3000);s.pause(3000);
 const old=await f.runs.saveSimulation({id:await f.runs.newSimulationId(),courseId:f.course.id,...s.recording()},owner);assert.equal(old.courseOutcome,'stopped');
 const saved=await f.runs.simulationContinuation(f.course.id);assert.ok(saved);const resumed=createRunningSimulation(route,saved);
 assert.equal(resumed.snapshot().progressM,s.snapshot().progressM);assert.ok(resumed.snapshot().trace.flat().length>10);
 resumed.play(0);for(let t=100;t<60000;t+=100){if(resumed.update(t).status==='arrived')break;}
 assert.equal(resumed.snapshot().status,'arrived');const later=createRunRepository(f.db,()=>BASE+1000,()=>owner);const result=await later.saveSimulation({id:await later.newSimulationId(),courseId:f.course.id,...resumed.recording()},owner);
 assert.equal(result.courseOutcome,'finished');assert.deepEqual(await f.runs.get(old.id),old);assert.equal(await f.runs.simulationContinuation(f.course.id),null);
});

test('reopening a simulation twice preserves stored pause segment boundaries even with a short virtual gap',async t=>{
 const f=await fixture(t),a=createRunningSimulation(route);a.play(0);a.update(3000);a.pause(3000);
 await f.runs.saveSimulation({id:await f.runs.newSimulationId(),courseId:f.course.id,...a.recording()},owner);
 const b=createRunningSimulation(route,await f.runs.simulationContinuation(f.course.id));b.play(0);b.update(1000);b.pause(1000);
 const later=createRunRepository(f.db,()=>BASE+1000,()=>owner);const saved=await later.saveSimulation({id:await later.newSimulationId(),courseId:f.course.id,...b.recording()},owner);
 const points=await later.points(saved.id);assert.ok(new Set(points.map(p=>p.segment)).size>=2);
 const c=createRunningSimulation(route,await later.simulationContinuation(f.course.id));assert.equal(c.snapshot().trace.filter(p=>p.length).length,new Set(points.map(p=>p.segment)).size);
});

test('synced stopped simulation restores its missing checkpoint and resumes a re-saved copy of the same course',async t=>{
 const f=await fixture(t),s=createRunningSimulation(route);s.play(0);s.update(3000);s.pause(3000);
 const old=await f.runs.saveSimulation({id:await f.runs.newSimulationId(),courseId:f.course.id,...s.recording()},owner);
 const pending=(await createSyncRepository(f.db,()=>owner).pending(owner)).find(p=>p.kind==='run'&&p.id===old.id),hash=digest(pending.payload);
 const remote={owner_id:owner,kind:'run',record_id:old.id,version:1,mutation_id:pending.mutationId,deleted:false,summary:pending.summary,payload_path:`${owner}/run/${old.id}/${hash}.json`,payload_hash:hash};
 const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);await createSyncRepository(db,()=>owner).restore(owner,remote,pending.payload);
 assert.equal((await db.getFirstAsync('SELECT guidance_json FROM running_sessions WHERE id=?',old.id)).guidance_json,null);
 const course=await createCourseRepository(db,()=>BASE+1000,()=>owner).save(snapshot,'복원한 코스','f'.repeat(32));
 const runs=createRunRepository(db,()=>BASE+1000,()=>owner),saved=await runs.simulationContinuation(course.id);assert.ok(saved);assert.ok(saved.checkpoint.progress>100);assert.ok(saved.trace.flat().length>10);
 const resumed=createRunningSimulation(route,saved);resumed.play(0);for(let t=100;t<60000;t+=100){if(resumed.update(t).status==='arrived')break;}
 assert.equal(resumed.snapshot().status,'arrived');const result=await runs.saveSimulation({id:await runs.newSimulationId(),courseId:course.id,...resumed.recording()},owner);assert.equal(result.courseOutcome,'finished');assert.equal((await runs.get(old.id)).courseOutcome,'stopped');
});
