import { mkdirSync,writeFileSync } from 'node:fs';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { createStorageClient } from '../../src/modules/storage/client.ts';
import { encodeSnapshot } from '../../src/modules/courses/model.ts';
import { randomUUID } from 'node:crypto';
const folder='.cache/archive-fixture';mkdirSync(folder,{recursive:true});
const owner='10000000-0000-4000-8000-000000000001';
const db=openSqlite(`${folder}/running-art.db`),store=await createStorageClient(async()=>db,()=>owner)();
// Explicitly synthetic fixtures with actual schema/immutable copies, never device data.
const origin={lat:37.572,lng:127.015},route=[[127.015,37.572],[127.015,37.574],[127.018,37.574],[127.018,37.572],[127.015,37.572]];
const base={schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin,targetKm:3,lengthKm:3.12,score:80,route,target:route};
const entries=[];
for(let i=0;i<34;i++){
 const snapshot={...base,origin:{...origin,lng:origin.lng+i*0.00001}};
 const saved=await store.courses.save(snapshot,i===3?'긴 이름으로 카드와 상세 화면의 줄바꿈과 큰 글씨를 확인하는 저장 코스':i===0?'최근 미완주 하트':i===1?'완주한 하트':`저장 하트 ${i+1}`);
 entries.push({...saved,snapshot});
}
const runs=[];
for(let i=0;i<5;i++){
 const course=entries[i===4?1:i],id=randomUUID().replaceAll('-',''),at=Date.now()-(5-i)*86400000,encoded=encodeSnapshot(course.snapshot);
 const outcome=i===0?'stopped':i===3?null:'finished',courseId=outcome?course.id:null;
 await db.runAsync(`INSERT INTO running_sessions(id,status,started_at,ended_at,active_ms,checkpoint_at,resumed_at,distance_m,point_count,owner_id,course_id,course_name,course_snapshot_json,course_snapshot_hash,course_outcome)
 VALUES(?,'completed',?,?,?, ?,?,?,?, ?,?,?,?,?,?)`,id,at,at+1800000,1800000,at+1800000,at,3120,5,owner,courseId,courseId?(i===0?'최근 미완주 하트':'완주한 하트'):null,courseId?encoded.json:null,courseId?encoded.hash:null,outcome);
 for(let p=0;p<route.length;p++)await db.runAsync('INSERT INTO running_points(run_id,sequence,segment,timestamp,latitude,longitude,accuracy) VALUES(?,?,?,?,?,?,?)',id,p+1,0,at+p*450000,route[p][1],route[p][0],5);
 runs.push({id,courseId,outcome});
}
await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');await db.closeAsync();
writeFileSync(`${folder}/manifest.json`,JSON.stringify({owner,courses:entries.map(({id})=>({id})),runs},null,2));
console.log('Prepared 34 saved courses and 5 runs in isolated fixture database');
