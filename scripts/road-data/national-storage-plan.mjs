import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readJson, writeJson, sha256 } from './common.mjs';
import { validateNationalCatalog } from '../../src/modules/road-data/national-format.ts';

// Read-only capacity plan. Kept versions form a reference set; no remote delete
// operation exists here, so shared files cannot accidentally be pruned.
const { values } = parseArgs({ options: {
  keep: { type:'string',multiple:true }, candidate: { type:'string',multiple:true }, report: {type:'string'},
} });
assert.ok(values.keep?.length,'Keep the current release and required rollback releases');
function inventory(directory){
  const catalogBody=fs.readFileSync(path.join(directory,'catalog.json')),catalog=JSON.parse(catalogBody);
  validateNationalCatalog(catalog);
  const source=readJson(path.join(directory,'inventory.json'));
  assert.equal(source.release,catalog.release);assert.equal(source.source.sha256,catalog.sourceSha256);
  const entries=source.files.map(f=>({key:`tiles/${f.sha256}.json.gz`,bytes:f.bytes}));
  entries.push(...catalog.regions.map(r=>({key:`manifests/${r.manifest.sha256}.json`,bytes:r.manifest.bytes})),
    {key:`catalogs/${sha256(catalogBody)}.json`,bytes:catalogBody.length});
  return {release:catalog.release,sourceTimestamp:source.source.dataTimestamp,entries};
}
const retained=new Map(),releases=[];
for(const directory of values.keep){
  const info=inventory(directory);let newObjects=0,newBytes=0,sharedObjects=0;
  for(const item of info.entries){
    if(retained.has(item.key)){assert.equal(retained.get(item.key),item.bytes);sharedObjects++;}
    else{retained.set(item.key,item.bytes);newObjects++;newBytes+=item.bytes;}
  }
  releases.push({release:info.release,sourceTimestamp:info.sourceTimestamp,newObjects,newBytes,sharedObjects});
}
const unreferenced=new Map();
for(const directory of values.candidate??[]){
  for(const item of inventory(directory).entries)if(!retained.has(item.key))unreferenced.set(item.key,item.bytes);
}
const result={recordedAt:new Date().toISOString(),mode:'read-only',releases,
  retainedObjects:retained.size,retainedBytes:[...retained.values()].reduce((a,b)=>a+b,0),
  candidateUnreferencedObjects:unreferenced.size,candidateUnreferencedBytes:[...unreferenced.values()].reduce((a,b)=>a+b,0),
  excludes:'Small attribution notices, current pointer, bucket metadata and other prefixes',
  deletionAuthorized:false,notes:'Unreferenced candidates are not safe to delete solely on this report. Confirm last served time, cache retention window and rollback needs.'};
if(values.report)writeJson(values.report,result);
console.log(JSON.stringify(result));
