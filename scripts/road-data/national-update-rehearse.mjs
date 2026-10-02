import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { createRoadCache, migrateRoadCache } from '../../src/modules/road-data/persistent-cache.ts';
import { createRoadLoader, roadBounds } from '../../src/modules/road-data/client.ts';
import { nationalRegionId } from '../../src/modules/road-data/national-format.ts';
import { selectRoadFiles } from '../../src/modules/road-data/file-format.ts';
import { readJson, writeJson, sha256, codecs } from './common.mjs';

const oldDir='build/road-data/national-verified', newDir='build/road-data/national-260930';
function dataset(directory){
  const catalogBody=fs.readFileSync(path.join(directory,'catalog.json')),catalog=JSON.parse(catalogBody);
  const inventory=readJson(path.join(directory,'inventory.json'));
  const record=readJson(path.join(directory,'verification-report.json')).records.find(r=>r.id==='region-corner-10km');
  const region=catalog.regions.find(r=>r.id===nationalRegionId(record.origin));
  const manifest=readJson(path.join(directory,'manifests',`${region.manifest.sha256}.json`));
  return {directory,catalogBody,catalog,record,manifest,files:new Map(inventory.files.map(f=>[f.sha256,f]))};
}
const a=dataset(oldDir),b=dataset(newDir);
assert.notEqual(a.record.inputSha256,b.record.inputSha256,'Use a region with real source changes');
const changed=selectRoadFiles(b.manifest,roadBounds(b.record.origin,10000)).find(f=>!a.files.has(f.sha256));
assert.ok(changed,'A changed tile is required to exercise update failure');
const database=path.join(newDir,'update-rehearsal.sqlite');assert.ok(!fs.existsSync(database),'Fresh update database required');
const db=openSqlite(database);await migrateRoadCache(db);
let now=1000,current=a,corrupt=false,requests=0;
const cache=createRoadCache(db,codecs,{now:()=>now,maxAgeMs:100});
const fetcher=async url=>{
  requests++;const key=new URL(url).pathname;let body,type='application/json';
  if(key.endsWith('/current.json'))body=Buffer.from(JSON.stringify({format:'running-art-national-channel',schemaVersion:1,
    release:current.catalog.release,catalog:{bytes:current.catalogBody.length,sha256:sha256(current.catalogBody)}}));
  else if(key.includes('/catalogs/'))body=current.catalogBody;
  else if(key.includes('/manifests/'))body=fs.readFileSync(path.join(current.directory,'manifests',path.basename(key)));
  else{const hash=path.basename(key,'.json.gz'),file=current.files.get(hash);assert.ok(file);
    body=fs.readFileSync(path.join(current.directory,file.path));type='application/gzip';
    if(corrupt&&hash===changed.sha256){body=Buffer.from(body);body[20]^=1;}
  }
  const response=new Response(body,{headers:{'content-type':type,'content-length':String(body.length)}});
  Object.defineProperty(response,'url',{value:url});return response;
};
const load=createRoadLoader({supply:'national',getCache:async()=>cache,fetcher});
const records=[];
async function check(label,data,mode='prefer-cache',updateFailed=false){
  const before=requests,result=await load(data.record.origin,10000,new AbortController().signal,mode);
  assert.equal(sha256(JSON.stringify(result.elements)),data.record.inputSha256,label);
  assert.equal(result.cache.release,data.catalog.release);
  assert.equal(result.cache.updateFailed,updateFailed);
  records.push({label,requests:requests-before,inputSha256:data.record.inputSha256,...result.cache});
}
try{
  await check('initial-old',a);
  now=2000;current=b;corrupt=true;await check('failed-update-falls-back',a,'prefer-cache',true);
  assert.equal((await cache.status()).datasets,1,'Failed new data never commits');
  await check('offline-after-failure',a,'offline');
  now=3000;corrupt=false;await check('successful-new',b,'refresh');
  now=4000;current=a;await check('rollback-old',a,'refresh');
  now=5000;current=b;await check('restore-new',b,'refresh');
  await check('final-offline',b,'offline');
  writeJson(path.join(newDir,'update-rehearsal-report.json'),{recordedAt:new Date().toISOString(),
    transport:'local files through production channel/cache',oldSource:a.catalog.sourceSha256,newSource:b.catalog.sourceSha256,
    changedTile:changed.id,records,status:await cache.status()});
  console.log(JSON.stringify(records));
}finally{await cache.close();}
