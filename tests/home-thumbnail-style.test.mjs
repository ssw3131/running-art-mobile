import test from 'node:test';
import assert from 'node:assert/strict';
import { thumbnailStyle } from '../src/modules/home/thumbnail-style.ts';

test('thumbnail metadata stays inline without baked credits and preserves tile rendering settings',async()=>{
 const style={version:8,sources:{planet:{type:'vector',url:'https://example.com/tiles.json',maxzoom:15},credits:{type:'vector',attribution:'Provider'}},layers:[{id:'roads'}]};
 const original=JSON.stringify(style),calls=[];
 const result=await thumbnailStyle(style,async url=>{calls.push(url);return {ok:true,json:async()=>({tiles:['https://example.com/{z}/{x}/{y}.pbf'],minzoom:0,maxzoom:14,bounds:[-180,-85,180,85],attribution:'Tile provider',logo:'logo'})};});
 assert.deepEqual(calls,['https://example.com/tiles.json']);
 assert.deepEqual(result.sources.planet,{type:'vector',tiles:['https://example.com/{z}/{x}/{y}.pbf'],minzoom:0,maxzoom:15,bounds:[-180,-85,180,85],attribution:''});
 assert.equal(result.sources.credits.attribution,'');assert.equal(result.layers,style.layers);assert.equal(JSON.stringify(style),original);
});
test('missing tile metadata fails safely rather than returning a credited or empty native snapshot',async()=>{
 const style={sources:{planet:{type:'vector',url:'https://example.com/tiles.json'}}};
 await assert.rejects(thumbnailStyle(style,async()=>({ok:true,json:async()=>({tiles:[]})})),/tiles unavailable/);
 await assert.rejects(thumbnailStyle(style,async()=>({ok:false})),/metadata unavailable/);
});
