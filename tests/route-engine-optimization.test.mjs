import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as engine from '../src/modules/route-engine/engine.ts';

const original=createRequire(import.meta.url)('./reference/v02/src/route-engine.js');
const read=(name)=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));
const compact=(value)=>JSON.parse(JSON.stringify(value));
function sampleGraph() {
  const nodes=Array.from({length:36},(_,id)=>({id,x:(id%6-2)*100,y:(Math.floor(id/6)-2)*100,turn:id%3!==0,links:[]}));
  const edges=[],grid=new Map();
  for(const n of nodes) {
    grid.set(`${Math.floor(n.x/100)},${Math.floor(n.y/100)}`,[n.id]);
    for(const to of [n.id%6<5?n.id+1:-1,n.id<30?n.id+6:-1,n.id%6>0?n.id-1:-1,n.id>=6?n.id-6:-1]) {
      // Deterministic one-way restrictions and an isolated node exercise failed paths.
      if(to<0 || to===35 || n.id===35 || (n.id*7+to)%11===0) continue;
      const length=Math.hypot(n.x-nodes[to].x,n.y-nodes[to].y),id=edges.length;
      edges.push({a:n.id,b:to,length,tags:{highway:'footway'}});n.links.push({to,length,id});
    }
  }
  return {nodes,edges,grid,cell:100,origin:{lat:0,lng:0}};
}

test('A* preserves original tie order, directed failures and exact budget boundaries',()=>{
  const graph=sampleGraph();
  for(let a=0;a<36;a++) for(let b=0;b<36;b++) for(const budget of [-1,0,199.999999999,200,200.000000001,600,Infinity]) {
    assert.deepEqual(engine.shortestPath(graph,a,b,budget),original.shortestPath(graph,a,b,budget),`${a}->${b}, budget ${budget}`);
  }
  graph.nodes[0].links=[];
  assert.deepEqual(engine.shortestPath(graph,0,34),[],'no cache survives a graph edit between calls');
});

test('nearest-node bounds preserve ties, cell boundaries, turn and reachability filters',()=>{
  const graph=sampleGraph();
  for(const reachable of [undefined,new Set([0,3,6,9,10,13,24,30])]) {
    graph.reachable=reachable;
    for(let i=0;i<350;i++) {
      const p={x:(i*137%700)-300,y:(i*193%700)-300};
      for(const limit of [0,50,100,180,230]) for(const turns of [false,true]) {
        assert.equal(engine.nearestNode(graph,p,limit,turns)?.id,original.nearestNode(graph,p,limit,turns)?.id);
      }
    }
  }
});

test('interleaved searches on one graph own their routing state and bounded caches',()=>{
  const fixture=read('../assets/route-lab/grid.json');
  const graph=engine.buildGraph(fixture.elements,fixture.origin,fixture.options.radiusKm*1000);
  const cases=['grid-heart-v01','grid-diamond-v02'].map(id=>read(`./fixtures/route-engine/${id}.json`));
  const diagnostics=cases.map(()=>({}));
  const jobs=cases.map((c,i)=>engine.searchSteps(graph,c.options,undefined,diagnostics[i]));
  const results=[];
  while(results.filter(Boolean).length<jobs.length) {
    for(let i=0;i<jobs.length;i++) if(!results[i]) {
      const next=jobs[i].next();if(next.done) results[i]=next.value;
    }
  }
  for(let i=0;i<cases.length;i++) {
    assert.deepEqual(compact(results[i]),cases[i].result);
    assert.ok(diagnostics[i].pathCacheHits>0);
    assert.ok(diagnostics[i].maxCachedPaths<=8192);
    assert.ok(diagnostics[i].maxCachedNodes<=262144);
  }
  // Cancel after actual A* work, then start again on the same graph.
  const cancelledDiagnostics={};
  const cancelled=engine.searchSteps(graph,cases[0].options,undefined,cancelledDiagnostics);
  do {assert.equal(cancelled.next().done,false);} while(cancelledDiagnostics.pathSearches<50);
  cancelled.return();
  assert.deepEqual(compact(engine.search(graph,cases[0].options)),cases[0].result);
});
