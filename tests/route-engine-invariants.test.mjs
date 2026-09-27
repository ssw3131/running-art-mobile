// Adapted from the preserved v0.2 invariant tests; same assertions, mobile module.
import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/modules/route-engine/engine.ts";
const origin={lat:37.57162,lng:126.9764};
function way(id,ids,points,tags={highway:'residential'}) {
  return {type:'way',id,nodes:ids,tags,geometry:points.map(p=>{const [lat,lon]=E.toLatLng(p,origin);return {lat,lon};})};
}
test('pixel heart is closed, angular, and keeps a 5km perimeter at every rotation',()=>{
  const heart=E.heartTemplate(),scale=5000/E.pathLength(heart);
  assert.deepEqual(heart[0],heart.at(-1));
  for(let i=1;i<heart.length;i++) assert.ok(heart[i].x===heart[i-1].x||heart[i].y===heart[i-1].y);
  for(let deg=0;deg<360;deg+=5) assert.ok(Math.abs(E.pathLength(E.transformPoints(heart,scale,deg*Math.PI/180,123,456))-5000)<1e-8);
});
test('nearby but distinct OSM nodes do not connect; long edges are retained',()=>{
  const g=E.buildGraph([
    way(1,[1,2],[{x:0,y:0},{x:800,y:0}]),
    way(2,[3,4],[{x:800,y:1},{x:900,y:1}])
  ],origin,2000);
  const a=E.nearestNode(g,{x:0,y:0}),b=E.nearestNode(g,{x:800,y:0}),c=E.nearestNode(g,{x:900,y:1});
  assert.ok(E.shortestPath(g,a.id,b.id,900).length>2);
  assert.deepEqual(E.shortestPath(g,a.id,c.id,2000),[]);
});
test('access filtering and pedestrian one-way rules are enforced',()=>{
  for(const tags of [{highway:'motorway'},{highway:'footway',foot:'no'},{highway:'path',access:'private'},{highway:'cycleway'},{highway:'path','foot:conditional':'no @ (night)'}]) assert.equal(E.runnable(tags),false);
  assert.equal(E.runnable({highway:'cycleway',foot:'yes'}),true);
  const g=E.buildGraph([way(1,[1,2],[{x:0,y:0},{x:200,y:0}],{highway:'footway','oneway:foot':'yes'})],origin,1000);
  const a=E.nearestNode(g,{x:0,y:0}),b=E.nearestNode(g,{x:200,y:0});
  assert.ok(E.shortestPath(g,a.id,b.id,210).length);
  assert.deepEqual(E.shortestPath(g,b.id,a.id,210),[]);
});
test('disconnected outlines are rejected instead of drawing straight fallback lines',()=>{
  const g=E.buildGraph([way(1,[1,2],[{x:0,y:0},{x:100,y:0}]),way(2,[3,4],[{x:200,y:0},{x:300,y:0}])],origin,1000);
  assert.equal(E.routeFromTemplate(g,[{x:0,y:0},{x:300,y:0},{x:0,y:0}],1000),null);
});
test('duplicate route suppression ranks by unrounded score and edge overlap',()=>{
  const c=(raw,edges)=>({score:{raw},usage:{edges:new Map(edges)}});
  const a=c(80,[['a',100],['b',100]]),b=c(90,[['b',100],['a',100]]),d=c(85,[['x',100]]);
  assert.deepEqual(E.uniqueCandidates([a,b,d]),[b,d]);
});
test('search returns five distinct road-connected round trips with fixed size and distance bounds',()=>{
  const ways=[],n=23,step=180;let id=1;
  const p=(x,y)=>({x:(x-11)*step,y:(y-11)*step});
  const key=(x,y)=>y*n+x+1;
  for(let y=0;y<n;y++) ways.push(way(id++,Array.from({length:n},(_,x)=>key(x,y)),Array.from({length:n},(_,x)=>p(x,y))));
  for(let x=0;x<n;x++) ways.push(way(id++,Array.from({length:n},(_,y)=>key(x,y)),Array.from({length:n},(_,y)=>p(x,y))));
  const g=E.buildGraph(ways,origin,3000),result=E.search(g,{version:'0.1',shape:'heart',targetKm:5,radiusKm:3});
  assert.equal(result.candidates.length,5);
  const start=E.nearestNode(g,{x:0,y:0});
  let previous=Infinity;
  for(const c of result.candidates) {
    assert.ok(c.score.raw<=previous);previous=c.score.raw;
    assert.ok(c.score.lengthKm>=3.75&&c.score.lengthKm<=6.25);
    assert.ok(Math.abs(E.pathLength(c.target)-5000)<1e-7);
    assert.deepEqual(c.route[0],{x:start.x,y:start.y});assert.deepEqual(c.route[0],c.route.at(-1));
    for(let i=1;i<c.route.length;i++) {
      const a=E.nearestNode(g,c.route[i-1],1),b=E.nearestNode(g,c.route[i],1);
      assert.ok(a.links.some(link=>link.to===b.id));
    }
  }
});
