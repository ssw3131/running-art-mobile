import assert from 'node:assert/strict';
import test from 'node:test';
import { openSqlite } from './helpers/sqlite.mjs';
import { migrateDatabase, migrations } from '../src/modules/storage/migrations.ts';
import { createRunRepository } from '../src/modules/running/repository.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { createSyncRepository } from '../src/modules/sync/repository.ts';
import { createAchievementsRepository } from '../src/modules/achievements/repository.ts';
import { createHomeRepository } from '../src/modules/home/repository.ts';
import { activityCredits, repairActivityHistories } from '../src/modules/running/activity-history.ts';
import { createSimulator } from '../src/modules/guidance/simulator.ts';
import { digest } from '../src/modules/sync/model.ts';
import { offset } from '../src/modules/guidance/geometry.ts';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', scope = () => owner;
const base = 1800000000000;
async function database(t, steps=migrations) {
  const db = openSqlite();
  t.after(() => db.closeAsync());
  await migrateDatabase(db,steps);
  return db;
}
async function totals(db) {
  const {badges,summary} = await createAchievementsRepository(db,scope).gallery();
  const distance = badges.find(b => b.definition.id === 'distance-10');
  const time = badges.find(b => b.definition.id === 'time-5');
  assert.equal(summary.distanceM,distance.progress);
  assert.equal(summary.activeMs,time.progress);
  return {distanceM:distance.progress,activeMs:time.progress,earned:distance.earned};
}
function remote(item, legacy) {
  const envelope = JSON.parse(item.payload);
  if (legacy) delete envelope.activityHistory;
  const payload = JSON.stringify(envelope), hash = digest(payload);
  return [{owner_id:owner,kind:'run',record_id:item.id,version:1,mutation_id:item.mutationId,deleted:false,
    summary:item.summary,payload_hash:hash,payload_path:`${owner}/run/${item.id}/${hash}.json`},payload];
}

for (const stops of [[4100],[4100,4800]]) test(`6km course with ${stops.length} restarts: credits, deletion and reverse backup restore`,async t=>{
  const db = await database(t);
  let clock = base;
  const runs = createRunRepository(db,()=>clock,scope), sync = createSyncRepository(db,scope);
  const route = [[0,0],[0,1500],[1500,1500],[1500,0],[0,0]].map(([x,y])=>offset([127,37],x,y));
  const course = await createCourseRepository(db,()=>clock,scope).save({schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',
    origin:{lat:37,lng:127},targetKm:6,lengthKm:6,score:80,route,target:route},'이어달리기');
  const source = createSimulator(route,'normal');
  let position = route[0], shift = 0;
  const fix = () => ({timestamp:clock,latitude:position[1],longitude:position[0],accuracy:5});
  const snapshots = [];
  for (const target of [...stops,Infinity]) {
    const run = await runs.start(course.id,fix());
    for (let i=0;i<10000;i++) {
      const sample = source.step();
      assert.ok(sample);
      clock=base+shift+sample.timestamp;position=sample.position;
      const result=await runs.append([fix()]);
      if (result.paused || (await runs.get(run.id)).distanceM>=target) break;
    }
    await runs.transition(run.id,'completed');
    snapshots.push(await sync.shareRecord(owner,run.id));
    shift+=86400000;clock+=86400000;
  }
  const final = snapshots.at(-1).summary;
  assert.equal(final.courseOutcome,'finished');
  assert.equal((snapshots[0].summary.distanceM/1000).toFixed(2),'4.10');
  if (stops.length === 1) assert.equal((final.distanceM/1000).toFixed(2),'5.99');
  assert.ok(final.distanceM < 6000 && snapshots[0].summary.distanceM+final.distanceM>10000);
  const expected={distanceM:final.distanceM,activeMs:final.activeMs,earned:false};
  assert.deepEqual(await totals(db),expected);
  assert.equal((await createHomeRepository(db,scope).read(clock)).monthlyDistanceM,final.distanceM);
  for (const legacy of [false,true]) {
    const restored=await database(t), repository=createSyncRepository(restored,scope);
    for (const item of [...snapshots].reverse()) assert.equal(await repository.restore(owner,...remote(item,legacy)),true);
    assert.deepEqual(await totals(restored),expected);
    const rr=createRunRepository(restored,()=>clock,scope);
    for(const item of snapshots.slice(0,-1).reverse()) await rr.remove(item.id);
    assert.deepEqual(await totals(restored),expected);
    await rr.remove(snapshots.at(-1).id);
    assert.deepEqual(await totals(restored),{distanceM:0,activeMs:0,earned:false});
  }
  if (stops.length === 1) {
    const fresh = await runs.start(course.id,fix());
    const track = createSimulator(route,'normal'), restart = clock;
    assert.equal((await runs.get(fresh.id)).distanceM,0);
    for (let i=0;i<10000;i++) {
      const sample=track.step();assert.ok(sample);
      clock=restart+sample.timestamp;position=sample.position;
      await runs.append([fix()]);
      if ((await runs.get(fresh.id)).distanceM+final.distanceM>=10000) break;
    }
    await runs.transition(fresh.id,'completed');
    const gallery=await createAchievementsRepository(db,scope).gallery();
    const milestone=gallery.badges.find(b=>b.definition.id==='distance-10');
    assert.equal(milestone.earned,true);assert.equal(milestone.runIds.at(-1),fresh.id);
    assert.equal(milestone.earnedAt,clock);
    await runs.remove(fresh.id);assert.deepEqual(await totals(db),expected);
  }
  await runs.remove(snapshots.at(-1).id);
  assert.equal((await totals(db)).distanceM,snapshots.at(-2).summary.distanceM);
  const missing=10000-snapshots.at(-2).summary.distanceM;
  await db.runAsync(`INSERT INTO running_sessions(id,owner_id,status,started_at,ended_at,checkpoint_at,resumed_at,distance_m)
    VALUES(?,?,'completed',?,?,?,?,?)`,'f'.repeat(32),owner,clock,clock,clock,clock,missing);
  assert.equal((await totals(db)).earned,true);
});

test('shared prefixes survive missing ancestors and independently completed branches',()=>{
  const root={id:'a',distanceM:4100,activeMs:100},middle={id:'b',distanceM:4800,activeMs:150};
  const rows=[{...middle,startedAt:2},{id:'c',startedAt:3,distanceM:5990,activeMs:190,history:{ancestors:[root,middle]}},
    {id:'d',startedAt:4,distanceM:4800,activeMs:155,history:{ancestors:[root]}}];
  const credit=[...activityCredits(rows.reverse()).values()];
  assert.equal(credit.reduce((sum,p)=>sum+p.distanceM,0),6690);
  assert.equal(credit.reduce((sum,p)=>sum+p.activeMs,0),245);
});

test('time milestones count distinct hours and revoke when their last supporting record is deleted',async t=>{
  const db=await database(t), hour=3600000;
  const first='1'.repeat(32), second='2'.repeat(32), fresh='3'.repeat(32);
  for (const [id,ms] of [[first,2*hour],[second,4*hour],[fresh,hour]]) {
    await db.runAsync(`INSERT INTO running_sessions(id,owner_id,status,started_at,ended_at,checkpoint_at,resumed_at,active_ms)
      VALUES(?,?,'completed',0,?,0,0,?)`,id,owner,ms,ms);
  }
  await db.runAsync('INSERT INTO run_activity_history VALUES(?,?)',second,JSON.stringify({ancestors:[{id:first,distanceM:0,activeMs:2*hour}]}));
  const repo=createAchievementsRepository(db,scope);
  const badge=async()=> (await repo.gallery()).badges.find(b=>b.definition.id==='time-5');
  assert.equal((await badge()).earned,true);
  await db.runAsync('DELETE FROM running_sessions WHERE id=?',first);
  assert.equal((await badge()).progress,5*hour);
  await db.runAsync('DELETE FROM running_sessions WHERE id=?',fresh);
  assert.equal((await badge()).earned,false);
});

test('upgrade matches an exact copied GPS prefix and segment break, preserving independent records and other owners',async t=>{
  const db=await database(t,migrations.slice(0,9));
  const ids=['a','b','c','d'].map(letter=>letter.repeat(32));
  for(const [i,id] of ids.entries()) {
    await db.runAsync(`INSERT INTO running_sessions(id,owner_id,status,started_at,ended_at,checkpoint_at,resumed_at,course_id,course_snapshot_hash,course_outcome,point_count,distance_m,active_ms)
      VALUES(?,?,'completed',100,?,100,100,'course','hash',?,?,?,?)`,id,i===3?'other':owner,200+i,i===0?'stopped':'finished',i===0?2:3,i===0?40:70,i===0?50:80);
    for(let j=1;j<=(i===0?2:3);j++) await db.runAsync('INSERT INTO running_points VALUES(?,?,?,?,?,?,?)',
      id,j,j===3&&i!==2?2:1,100+j,37,127+j/10000,5);
  }
  const before=await db.getAllAsync('SELECT * FROM running_points ORDER BY run_id,sequence');
  await migrateDatabase(db);
  const result=await db.getAllAsync('SELECT h.history FROM running_sessions r LEFT JOIN run_activity_history h ON h.run_id=r.id ORDER BY r.id');
  assert.deepEqual(JSON.parse(result[1].history).ancestors,[{id:ids[0],startedAt:100,distanceM:40,activeMs:50}]);
  assert.equal(result[0].history,null);assert.equal(result[2].history,null);assert.equal(result[3].history,null);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM running_points ORDER BY run_id,sequence'),before);
  assert.equal((await totals(db)).distanceM,140);
  // Restoring an equally good prefix later must give the same conservative answer as a cold migration.
  const duplicate='e'.repeat(32);
  await db.runAsync(`INSERT INTO running_sessions(id,owner_id,status,started_at,ended_at,checkpoint_at,resumed_at,course_id,course_snapshot_hash,course_outcome,point_count,distance_m,active_ms)
    SELECT ?,owner_id,status,started_at,ended_at,checkpoint_at,resumed_at,course_id,course_snapshot_hash,course_outcome,point_count,distance_m,active_ms
    FROM running_sessions WHERE id=?`,duplicate,ids[0]);
  await db.runAsync('INSERT INTO running_points SELECT ?,sequence,segment,timestamp,latitude,longitude,accuracy FROM running_points WHERE run_id=?',duplicate,ids[0]);
  await repairActivityHistories(db,owner,'hash');
  assert.equal((await totals(db)).distanceM,220);
  assert.deepEqual(JSON.parse((await db.getFirstAsync('SELECT history FROM run_activity_history WHERE run_id=?',ids[1])).history).ancestors,[]);
});
