// Synthetic public Seoul fixtures only. No phone account tokens or original records.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { migrateDatabase } from '../../src/modules/storage/migrations.ts';
import { createCourseRepository } from '../../src/modules/courses/repository.ts';
import { createRunRepository } from '../../src/modules/running/repository.ts';
import { prepareRoute, positionAt } from '../../src/modules/guidance/geometry.ts';
const dir='.cache/phone-validation';
const custom=JSON.parse(fs.readFileSync(dir+'/custom.json','utf8'));
const free=JSON.parse(fs.readFileSync('.cache/free-loop-qa/fixture.json','utf8')).snapshot;
assert.equal(custom.snapshot.schemaVersion,3);assert.equal(free.schemaVersion,2);
const db=openSqlite();await migrateDatabase(db);
let now=Date.now()-3600000;
const owner='11111111-1111-4111-8111-111111111111';
const courses=createCourseRepository(db,()=>now,()=>owner),runs=createRunRepository(db,()=>now,()=>owner);
const ids=new Map();
for(const [snapshot,name] of [[free,'QA phone v2'],[custom.snapshot,'QA phone v3']]) {
  const course=await courses.save(snapshot,name);
  ids.set(course.id,name.endsWith('v3')?custom.id:'0505'+randomBytes(14).toString('hex'));
  const route=prepareRoute(snapshot.route);
  const fix=m=>{const [longitude,latitude]=positionAt(route,m);return {timestamp:now,longitude,latitude,accuracy:5};};
  const run=await runs.start(course.id,fix(0));ids.set(run.id,'0505'+randomBytes(14).toString('hex'));
  for(let meters=0;meters<route.totalMeters*.75;meters+=12){await runs.append([fix(meters)]);now+=6000;}
  await runs.transition(run.id,'completed');now+=60000;
}
const output={};
for(const table of ['saved_courses','running_sessions','running_points']){
  output[table]=(await db.getAllAsync('SELECT * FROM '+table)).filter(row=>table!=='saved_courses'||row.name==='QA phone v2').map(row=>{
    for(const key of ['id','course_id','run_id'])if(ids.has(row[key]))row[key]=ids.get(row[key]);
    return row;
  });
}
assert.equal(output.saved_courses.length,1);assert.equal(output.running_sessions.length,2);
assert.ok(output.running_points.length>20);
fs.writeFileSync(dir+'/fixture.json',JSON.stringify(output));
fs.writeFileSync(dir+'/fixture-summary.json',JSON.stringify({courseId:output.saved_courses[0].id,customId:custom.id,runs:output.running_sessions.map(r=>({id:r.id,name:r.course_name,points:r.point_count})),syntheticPoints:output.running_points.length},null,2));
console.log(JSON.stringify({courses:1,runs:2,syntheticPoints:output.running_points.length}));
await db.closeAsync();
