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
async function fixture(t){const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);const scope={owner};const runs=createRunRepository(db,()=>BASE,()=>scope.owner),courses=createCourseRepository(db,()=>BASE,()=>scope.owner);const course=await courses.save(snapshot,'Recorded simulation');return {db,runs,course,scope};}
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
