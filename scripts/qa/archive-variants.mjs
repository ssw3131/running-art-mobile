import {copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {openSqlite} from '../../tests/helpers/sqlite.mjs';
import {createStorageClient} from '../../src/modules/storage/client.ts';
const folder='.cache/archive-fixture',manifest=JSON.parse(readFileSync(`${folder}/manifest.json`));
for(const variant of ['paused','interrupted','deleted','empty']){
 copyFileSync(`${folder}/running-art.db`,`${folder}/${variant}.db`);
 const db=openSqlite(`${folder}/${variant}.db`),store=await createStorageClient(async()=>db,()=>manifest.owner)();
 if(variant==='empty'){
  await db.runAsync('DELETE FROM running_sessions');await db.runAsync('DELETE FROM saved_courses');
 }else if(variant==='deleted'){
  await db.runAsync('DELETE FROM saved_courses WHERE id=?',manifest.courses[1].id);
 }else{
  const course=await store.courses.get(manifest.courses[0].id),[longitude,latitude]=course.snapshot.route[0];
  const run=await store.runs.start(course.id,{timestamp:Date.now(),latitude,longitude,accuracy:5});
  await store.runs.transition(run.id,variant);
  manifest[variant]={id:run.id,courseId:course.id};
 }
 await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');await db.closeAsync();
}
writeFileSync(`${folder}/manifest.json`,JSON.stringify(manifest,null,2));
console.log('Created paused, interrupted, deleted-source and empty fixture variants');
