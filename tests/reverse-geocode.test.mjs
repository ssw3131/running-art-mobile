import assert from 'node:assert/strict';
import test from 'node:test';
import { createReverseGeocode } from '../src/modules/map/place-search.ts';
const origin = {lat:37.57,lng:126.98};
test('reverse geocoding uses the settled coordinate and Korean language',async()=>{
 let url;
 const reverse=createReverseGeocode(async value=>{url=new URL(value);return {ok:true,json:async()=>({features:[{place_name:'서울특별시 종로구',center:[126.98,37.57]}]})};});
 assert.equal(await reverse(origin,'key',new AbortController().signal),'서울특별시 종로구');
 assert.equal(url.pathname,'/geocoding/126.98,37.57.json');assert.equal(url.searchParams.get('language'),'ko');
});
test('missing key and invalid points never contact the provider',async()=>{
 let calls=0;const reverse=createReverseGeocode(async()=>{calls++;});
 await assert.rejects(reverse(origin,undefined,new AbortController().signal));
 await assert.rejects(reverse({lat:NaN,lng:127},'key',new AbortController().signal));assert.equal(calls,0);
});
test('empty/error responses do not invent an address or expose a provider key',async()=>{
 const reverse=createReverseGeocode(async()=>({ok:true,json:async()=>({features:[]})}));
 await assert.rejects(reverse(origin,'secret',new AbortController().signal),error=>!error.message.includes('secret')&&error.message.includes('주소'));
});
