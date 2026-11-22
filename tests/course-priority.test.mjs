import assert from 'node:assert/strict';
import test from 'node:test';
import {openSqlite} from './helpers/sqlite.mjs';
import {migrateDatabase} from '../src/modules/storage/migrations.ts';
import {createCourseRepository} from '../src/modules/courses/repository.ts';
import {createHomeRepository} from '../src/modules/home/repository.ts';
import {demoCourse} from '../src/modules/guidance/simulator.ts';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',id=n=>n.toString(16).padStart(32,'0');
test('unfinished priority happens before pagination and home truncation, isolates owners, and uses latest attempt',async t=>{
 const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);let now=1000;const courses=createCourseRepository(db,()=>++now,()=>A),route=demoCourse('normal');
 const snapshot=n=>({schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lng:route[0][0],lat:route[0][1]},targetKm:n,lengthKm:3,score:80,route,target:route});
 for(let n=1;n<=7;n++)await courses.save(snapshot(n),'코스'+n,id(n));
 const attempt=async(n,course,owner,status,outcome,ended)=>db.runAsync('INSERT INTO running_sessions(id,owner_id,status,started_at,ended_at,checkpoint_at,resumed_at,course_id,course_outcome) VALUES(?,?,?,?,?,?,?,?,?)',id(n),owner,status,ended-10,status==='completed'?ended:null,ended,ended,course,outcome);
 await attempt(10,id(1),A,'completed','stopped',3000);
 await attempt(11,id(2),A,'interrupted','active',3001);
 await attempt(12,id(3),B,'completed','stopped',4000);
 assert.deepEqual((await courses.list(2)).map(c=>c.id),[id(2),id(1)]);
 assert.deepEqual((await courses.list(3,2)).map(c=>c.id),[id(7),id(6),id(5)]);
 assert.deepEqual((await createHomeRepository(db,()=>A).read(5000)).courses.map(c=>c.course.id),[id(2),id(1),id(7),id(6),id(5)]);
 await attempt(13,id(1),A,'completed','finished',5000);
 assert.deepEqual((await courses.list(3)).map(c=>c.id),[id(2),id(7),id(6)]);
 assert.equal((await courses.list(10)).find(c=>c.id===id(1)).unfinished,false);
});

for(const status of ['running','paused','interrupted'])test(`${status} course stays ahead of six newer stopped courses before paging and home truncation`,async t=>{
 const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);
 let now=1000,owner=A;const courses=createCourseRepository(db,()=>++now,()=>owner),home=createHomeRepository(db,()=>owner),route=demoCourse('normal');
 for(let n=1;n<=8;n++)await courses.save({schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lng:route[0][0],lat:route[0][1]},targetKm:n,lengthKm:3,score:80,route,target:route},'코스'+n,id(n));
 const first=await db.getFirstAsync('SELECT snapshot_hash FROM saved_courses WHERE id=?',id(1));
 // A restored immutable snapshot must still identify its course without a course ID.
 await db.runAsync('INSERT INTO running_sessions(id,owner_id,status,started_at,checkpoint_at,resumed_at,course_snapshot_hash,course_outcome) VALUES(?,?,?,?,?,?,?,?)',id(20),A,status,2000,2000,2000,first.snapshot_hash,'active');
 for(let n=2;n<=7;n++)await db.runAsync('INSERT INTO running_sessions(id,owner_id,status,started_at,ended_at,checkpoint_at,resumed_at,course_id,course_outcome) VALUES(?,?,?,?,?,?,?,?,?)',id(20+n),A,'completed',3000+n,4000+n,4000+n,4000+n,id(n),'stopped');
 // A different account's stopped attempt must never promote this account's course.
 // The device permits only one active session, including across accounts.
 await db.runAsync('INSERT INTO running_sessions(id,owner_id,status,started_at,ended_at,checkpoint_at,resumed_at,course_id,course_outcome) VALUES(?,?,?,?,?,?,?,?,?)',id(40),B,'completed',5000,5100,5100,5100,id(8),'stopped');
 const before=await db.getAllAsync('SELECT * FROM running_sessions ORDER BY id');
 assert.deepEqual((await courses.list(3)).map(c=>c.id),[id(1),id(7),id(6)]);
 assert.deepEqual((await courses.list(3,3)).map(c=>c.id),[id(5),id(4),id(3)]);
 assert.deepEqual((await home.read(6000)).courses.map(c=>c.course.id),[id(1),id(7),id(6),id(5),id(4)]);
 assert.equal((await courses.list(1))[0].inProgress,true);
 assert.equal((await courses.list(2))[1].inProgress,false);
 owner=B;assert.deepEqual(await courses.list(10),[]);assert.deepEqual((await home.read(6000)).courses,[]);owner=A;
 assert.deepEqual(await db.getAllAsync('SELECT * FROM running_sessions ORDER BY id'),before);
 await db.runAsync("UPDATE running_sessions SET status='completed',course_outcome='finished',ended_at=7000 WHERE id=?",id(20));
 assert.deepEqual((await courses.list(10)).map(c=>c.id),[id(7),id(6),id(5),id(4),id(3),id(2),id(8),id(1)]);
 assert.deepEqual((await home.read(8000)).courses.map(c=>c.course.id),[id(7),id(6),id(5),id(4),id(3)]);
 assert.equal((await courses.list(10)).find(c=>c.id===id(1)).unfinished,false);
});
