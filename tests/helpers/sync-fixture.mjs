
import assert from 'node:assert/strict';
import { openSqlite } from './sqlite.mjs';
import { migrateDatabase, migrations } from '../../src/modules/storage/migrations.ts';
import { createCourseRepository } from '../../src/modules/courses/repository.ts';
import { createRunRepository } from '../../src/modules/running/repository.ts';
import { createSyncRepository } from '../../src/modules/sync/repository.ts';
import { synchronize, resolveConflict } from '../../src/modules/sync/engine.ts';
import { validateRemote, decodePayload, digest } from '../../src/modules/sync/model.ts';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const snapshot=(n=0)=>({schemaVersion:1,engineVersion:'0.2',source:'synthetic',shape:'heart',origin:{lat:0,lng:0},targetKm:1,lengthKm:1,score:90,
  route:[[0,0],[0.001+n*0.0001,0]],target:[[0,0],[0.001,0]]});
async function device(t,initial=A) {
  const db=openSqlite();t.after(()=>db.closeAsync());await migrateDatabase(db);
  let owner=initial,at=1000000;
  const scope=()=>owner;
  const courses=createCourseRepository(db,()=>at,scope),runs=createRunRepository(db,()=>at,scope),sync=createSyncRepository(db,scope);
  return {db,courses,runs,sync,setOwner:value=>{owner=value;},owner:()=>owner,time:value=>{at=value;}};
}
function cloud() {
  const records=new Map(),files=new Map();
  const hooks={};let requests=0;
  function remote(owner) {
    const key=(kind,id)=>`${owner}/${kind}/${id}`;
    return {
      async upload(path,payload){requests++;assert.ok(path.startsWith(owner+'/'));await hooks.upload?.();if(!files.has(path)) files.set(path,payload);},
      async download(path){requests++;assert.ok(path.startsWith(owner+'/'));await hooks.download?.();if(!files.has(path))throw new Error('Missing file');return files.get(path);},
      async commit(item,path,hash){
        requests++;const k=key(item.kind,item.id),current=records.get(k);
        if(current?.mutation_id===item.mutationId)return {outcome:'applied',record:structuredClone(current)};
        if((current?.version??0)!==item.remoteVersion)return {outcome:'conflict',record:structuredClone(current)};
        if(!item.deleted)assert.ok(files.has(path));
        const row={owner_id:owner,kind:item.kind,record_id:item.id,version:(current?.version??0)+1,mutation_id:item.mutationId,deleted:item.deleted,
          summary:structuredClone(item.summary),payload_path:item.deleted?current?.payload_path??null:path,payload_hash:item.deleted?current?.payload_hash??null:hash};
        records.set(k,row);await hooks.afterCommit?.(item,row);return {outcome:'applied',record:structuredClone(row)};
      },
      async page(kind,after){requests++;return [...records.values()].filter(r=>r.owner_id===owner&&r.kind===kind&&r.record_id>after).sort((a,b)=>a.record_id.localeCompare(b.record_id)).slice(0,2).map(r=>structuredClone(r));},
      async remove(path){requests++;await hooks.remove?.();if(![...records.values()].some(r=>!r.deleted&&r.payload_path===path)) files.delete(path);},
    };
  }
  return {records,files,hooks,remote,requests:()=>requests};
}
async function sync(d,c,extra={}) {
  const owner=d.owner();
  return synchronize({owner,repository:d.sync,remote:c.remote(owner),check:()=>assert.equal(d.owner(),owner),now:()=>2000000,...extra});
}
async function completedRun(d) {
  const run=await d.runs.start();d.time(1010000);
  await d.runs.append([{timestamp:1000000,latitude:0,longitude:0,accuracy:4},{timestamp:1005000,latitude:0,longitude:0.0002,accuracy:4}]);
  await d.runs.transition(run.id,'completed');return run.id;
}


export { A, B, snapshot, device, cloud, sync, completedRun };
