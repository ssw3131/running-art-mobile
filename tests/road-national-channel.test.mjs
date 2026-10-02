import test from 'node:test';
import assert from 'node:assert/strict';
import { nationalFixture } from './helpers/national-fixture.mjs';
import { openSqlite } from './helpers/sqlite.mjs';
import { codecs } from '../scripts/road-data/common.mjs';
import { createRoadCache, migrateRoadCache } from '../src/modules/road-data/persistent-cache.ts';
import { createRoadLoader } from '../src/modules/road-data/client.ts';
import { NATIONAL_PREFIX } from '../src/modules/road-data/national-format.ts';
const origin = {lat:37.5,lng:127}, signal = () => new AbortController().signal;
async function fixture(t) {
  const db = openSqlite(':memory:'); await migrateRoadCache(db); t.after(() => db.closeAsync());
  let data = nationalFixture(), now = 1000, corrupt = false;
  const calls = [], cache = createRoadCache(db,codecs,{ now:() => now, maxAgeMs:100 });
  const load = createRoadLoader({supply:'national',getCache:async()=>cache,fetcher:async url => {
    calls.push(url); const key = new URL(url).pathname.slice(1), item = data.objects.get(key);
    assert.ok(item, key);
    const body = Buffer.from(item.body);
    if(corrupt && key.includes('/tiles/')) body[20] ^= 1;
    const response = new Response(body,{headers:{'content-length':String(body.length),'content-type':item.contentType}});
    Object.defineProperty(response,'url',{value:url}); return response;
  }});
  return {cache,load,calls,set:(next,time,damage=false)=>{ data=next;now=time;corrupt=damage; }};
}
test('national channel pins one region and release, then reopens offline with zero requests',async t=>{
  const {load,calls}=await fixture(t);
  const first=await load(origin,2000,signal());
  assert.equal(first.elements.length,1); assert.equal(first.cache.downloaded,4);
  assert.equal(calls.length,7); // pointer + catalog + region manifest + four cells
  assert.ok(calls.every(url=>url.includes(`/${NATIONAL_PREFIX}/`)));
  const count=calls.length;
  assert.deepEqual((await load(origin,2000,signal(),'offline')).elements,first.elements);
  assert.equal(calls.length,count);
  const adjacent=await load({lat:37.4999,lng:126.9999},2000,signal());
  assert.deepEqual(adjacent.elements,first.elements);
});
test('failed national update preserves old complete data, then supports successful update and rollback',async t=>{
  const {load,set,cache}=await fixture(t), a=nationalFixture('test-a'), b=nationalFixture('test-b');
  const original=await load(origin,2000,signal());
  set(b,2000,true);
  const fallback=await load(origin,2000,signal());
  assert.equal(fallback.cache.updateFailed,true); assert.equal(fallback.cache.release,'test-a');
  assert.deepEqual(fallback.elements,original.elements);
  assert.equal((await cache.status()).datasets,1);
  set(b,2001);
  assert.equal((await load(origin,2000,signal(),'refresh')).cache.release,'test-b');
  set(a,2002);
  assert.equal((await load(origin,2000,signal(),'refresh')).cache.release,'test-a');
});
test('catalog hash corruption writes nothing and outside coverage makes no request',async t=>{
  const {load,set,cache,calls}=await fixture(t), broken=nationalFixture();
  const key=[...broken.objects.keys()].find(k=>k.includes('/catalogs/'));
  broken.objects.get(key).body[20]^=1; set(broken,1000);
  await assert.rejects(load(origin,2000,signal()),/검증/);
  assert.equal((await cache.status()).datasets,0);
  const count=calls.length;
  await assert.rejects(load({lat:40,lng:127},2000,signal()),/지원 범위/);
  assert.equal(calls.length,count);
});
