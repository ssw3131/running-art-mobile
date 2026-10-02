import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nationalFixture } from './helpers/national-fixture.mjs';
import { loadNationalBundle, NATIONAL_CURRENT_KEY } from '../scripts/road-data/national-deployment.mjs';
import { uploadBundle, promoteBundle, currentState, mapBounded } from '../scripts/road-data/publish.mjs';

function bundle(t, release) {
  const root=path.resolve('.cache/national-deploy-tests'); fs.mkdirSync(root,{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,'case-'));
  t.after(()=>{assert.ok(path.resolve(dir).startsWith(root+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
  const data=nationalFixture(release);
  for(const [relative,body] of data.local){const file=path.join(dir,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);}
  return loadNationalBundle(dir);
}
function memoryStore() {
  const objects=new Map();let serial=0;
  return {objects,async get(key,limit){const o=objects.get(key);if(o)assert.ok(o.body.length<=limit);return o??null;},
    async put(o,condition){const old=objects.get(o.key);
      if((condition.ifNoneMatch==='*'&&old)||(condition.ifMatch&&old?.etag!==condition.ifMatch))throw Object.assign(new Error('CAS'),{status:412});
      objects.set(o.key,{...o,body:Buffer.from(o.body),etag:`"${++serial}"`});
    }};
}
function publicFetch(store){return async url=>{
  const item=store.objects.get(new URL(url).pathname.slice(1));
  return item?new Response(item.body,{headers:{'content-type':item.contentType,'content-length':String(item.body.length),'cache-control':item.cacheControl}})
    :new Response(null,{status:404});
};}
test('national objects upload in bounded parallel batches and CAS promotes then restores a previous release',async t=>{
  const a=bundle(t,'test-a'),b=bundle(t,'test-b'),store=memoryStore();
  const options={concurrency:4,fetchImpl:publicFetch(store)};
  assert.equal((await uploadBundle(a,store,options)).uploaded,a.objects.length);
  assert.equal((await uploadBundle(a,store,options)).reused,a.objects.length);
  await promoteBundle(a,store,'https://example.test','absent',options);
  assert.equal((await currentState(store,NATIONAL_CURRENT_KEY)).sha256,a.current.sha256);
  await uploadBundle(b,store,options);
  await assert.rejects(promoteBundle(b,store,'https://example.test','absent',options));
  await promoteBundle(b,store,'https://example.test',a.current.sha256,options);
  await promoteBundle(a,store,'https://example.test',b.current.sha256,options);
  assert.equal((await currentState(store,NATIONAL_CURRENT_KEY)).sha256,a.current.sha256);
  assert.ok(!store.objects.has('roads/samples/v1/current.json'));
});
test('national source mutation is detected again when a prepared object is read',t=>{
  const b=bundle(t,'test-a'),tile=b.objects.find(o=>o.key.endsWith('.gz'));
  const localFiles=fs.readdirSync(path.join(b.directory,'tiles'));
  for(const file of localFiles)fs.writeFileSync(path.join(b.directory,'tiles',file),Buffer.from('damaged'));
  assert.throws(()=>tile.body);
});
test('national promotion keeps the previous pointer when any origin or public object is missing or damaged',async t=>{
  const a=bundle(t,'test-old'),b=bundle(t,'test-new'),store=memoryStore();
  const options={concurrency:4,fetchImpl:publicFetch(store)};
  await uploadBundle(a,store,options);
  await promoteBundle(a,store,'https://example.test','absent',options);
  await uploadBundle(b,store,options);
  const tile=b.objects.find(o=>o.key.endsWith('.gz')),saved=store.objects.get(tile.key);
  store.objects.delete(tile.key);
  await assert.rejects(promoteBundle(b,store,'https://example.test',a.current.sha256,options),/파일 없음/);
  assert.equal((await currentState(store,NATIONAL_CURRENT_KEY)).sha256,a.current.sha256);
  store.objects.set(tile.key,saved);
  const realFetch=publicFetch(store);
  const damaged={...options,fetchImpl:async(url,init)=>new URL(url).pathname.slice(1)===tile.key
    ?new Response(Buffer.alloc(tile.body.length),{headers:{'content-type':tile.contentType,'cache-control':tile.cacheControl}})
    :realFetch(url,init)};
  await assert.rejects(promoteBundle(b,store,'https://example.test',a.current.sha256,damaged),/해시 불일치/);
  assert.equal((await currentState(store,NATIONAL_CURRENT_KEY)).sha256,a.current.sha256);
});
test('bounded worker failure waits for in-flight operations and stops dispatching new work',async()=>{
  let active=0,finished=0;
  await assert.rejects(mapBounded([0,1,2,3,4],async n=>{
    active++;
    try{if(n===0)throw new Error('failed');await new Promise(r=>setTimeout(r,5));finished++;}
    finally{active--;}
  },{concurrency:2}),/failed/);
  assert.equal(active,0);assert.ok(finished<=1);
});
test('read verification allows 32 workers while uploads remain limited to 8',async()=>{
  let active=0,peak=0;
  await mapBounded(Array.from({length:40},(_,i)=>i),async()=>{
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,2));active--;
  },{concurrency:32});
  assert.equal(peak,32);assert.equal(active,0);
  await assert.rejects(mapBounded([],()=>{},{concurrency:33}));
  await assert.rejects(uploadBundle({objects:[]},{},{concurrency:9}),/최대 8/);
});
