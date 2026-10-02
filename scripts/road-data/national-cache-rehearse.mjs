import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { createRoadCache, migrateRoadCache } from '../../src/modules/road-data/persistent-cache.ts';
import { createRoadLoader } from '../../src/modules/road-data/client.ts';
import { DEFAULT_ROAD_BASE_URL } from '../../src/modules/road-data/channel.ts';
import { readJson, writeJson, sha256, codecs } from './common.mjs';

const { values } = parseArgs({ options: {
  directory: { type:'string',default:'build/road-data/national-verified' },
  mode: { type:'string',default:'local' }, database: { type:'string' }, maxBytes: { type:'string' },
  resume: { type:'boolean',default:false },
} });
assert.ok(['local','public','offline','capacity'].includes(values.mode));
const root=values.directory, report=readJson(path.join(root,'verification-report.json'));
const inventory=readJson(path.join(root,'inventory.json'));
const catalogBody=fs.readFileSync(path.join(root,'catalog.json')), catalog=JSON.parse(catalogBody);
const files=new Map(inventory.files.map(f=>[f.sha256,f]));
const dbFile=values.database??path.join(root,`cache-${values.mode}.sqlite`);
if(values.resume) assert.ok(values.mode==='public'&&fs.existsSync(dbFile),'Resume requires an existing public rehearsal database');
else if(values.mode!=='offline') assert.ok(!fs.existsSync(dbFile),'Use a fresh rehearsal database');
const db=openSqlite(dbFile);await migrateRoadCache(db);
const maxBytes=Number(values.maxBytes??(values.mode==='capacity'?3*1024*1024:64*1024*1024));
const cache=createRoadCache(db,codecs,{maxBytes});
let requests=0;
async function fetcher(url,init){
  requests++;
  if(values.mode==='offline') throw new Error('Offline rehearsal attempted a network request');
  if(values.mode==='public') return fetch(url,init);
  assert.equal(new URL(url).origin,DEFAULT_ROAD_BASE_URL);
  const key=new URL(url).pathname;
  let bytes,mime='application/json';
  if(key.endsWith('/current.json')) bytes=Buffer.from(JSON.stringify({format:'running-art-national-channel',schemaVersion:1,
    release:catalog.release,catalog:{bytes:catalogBody.length,sha256:sha256(catalogBody)}}));
  else if(key.includes('/catalogs/')){assert.ok(key.endsWith(`${sha256(catalogBody)}.json`));bytes=catalogBody;}
  else if(key.includes('/manifests/')) bytes=fs.readFileSync(path.join(root,'manifests',path.basename(key)));
  else {
    const hash=path.basename(key,'.json.gz'),file=files.get(hash);assert.ok(file);
    bytes=fs.readFileSync(path.join(root,file.path));mime='application/gzip';
  }
  const response=new Response(bytes,{headers:{'content-length':String(bytes.length),'content-type':mime}});
  Object.defineProperty(response,'url',{value:url});return response;
}
const load=createRoadLoader({supply:'national',getCache:async()=>cache,fetcher,timeoutMs:120000});
const records=[];
let activeCase;
try{
  for(const item of report.records){
    if(values.mode==='capacity'&&item.radiusMeters>2000)continue;
    activeCase=item.id;
    const before=requests,started=performance.now();
    const result=await load(item.origin,item.radiusMeters,new AbortController().signal,values.mode==='offline'?'offline':'prefer-cache');
    assert.equal(result.cache.release,catalog.release,`${item.id}: expected published release`);
    assert.equal(sha256(JSON.stringify(result.elements)),item.inputSha256,`${item.id}: full input`);
    const status=await cache.status();assert.ok(status.bytes<=maxBytes);
    records.push({id:item.id,requests:requests-before,elapsedMs:performance.now()-started,...result.cache,cacheBytes:status.bytes});
    console.log(JSON.stringify(records.at(-1)));
  }
  if(values.mode==='capacity'){
    const large=report.records.find(r=>r.radiusMeters===10000),before=await cache.status();
    await assert.rejects(load(large.origin,large.radiusMeters,new AbortController().signal),error=>error.code==='capacity');
    assert.deepEqual(await cache.status(),before,'Capacity failure preserves previous cache');
    const last=report.records.filter(r=>r.radiusMeters===2000).at(-1),count=requests;
    assert.equal(sha256(JSON.stringify((await load(last.origin,2000,new AbortController().signal,'offline')).elements)),last.inputSha256);
    assert.equal(requests,count);
  }
  const status=await cache.status();
  writeJson(path.join(root,`cache-${values.mode}-report.json`),{recordedAt:new Date().toISOString(),mode:values.mode,
    database:dbFile,resumed:values.resume,records,requests,status,capacityFailurePreserved:values.mode==='capacity'});
}catch(error){
  writeJson(path.join(root,`cache-${values.mode}-failure-report.json`),{recordedAt:new Date().toISOString(),mode:values.mode,
    database:dbFile,activeCase,completed:records,requests,error:error.message});
  throw new Error(`${activeCase}: ${error.message}`,{cause:error});
}finally{await cache.close();}
