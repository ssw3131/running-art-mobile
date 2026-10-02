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

test('large equal-priority and improving-cost frontiers match the original A*',()=>{
  // More than 128 live entries exercises queue growth and stale-entry skipping.
  const nodes=Array.from({length:260},(_,id)=>({id,x:id%2,y:0,turn:true,links:[]}));
  const edges=[];
  const connect=(a,b,length)=>{
    const id=edges.length;edges.push({a,b,length,tags:{highway:'footway'}});
    nodes[a].links.push({to:b,length,id});
  };
  for(let i=1;i<259;i++) {connect(0,i,100);connect(i,259,300-i);}
  for(let i=1;i<258;i++) connect(i,i+1,0.125);
  const graph={nodes,edges,grid:new Map(),cell:100,origin:{lat:0,lng:0}};
  for(const start of [0,1,127,258,259]) for(const end of [0,2,128,258,259]) {
    for(const budget of [0,99.999999999,100,100.000000001,150,500,Infinity]) {
      assert.deepEqual(engine.shortestPath(graph,start,end,budget),original.shortestPath(graph,start,end,budget),`${start}->${end} @ ${budget}`);
    }
  }
});

test('deferred beam materialization preserves all templates, repeats and directed failures',()=>{
  const graph=sampleGraph();
  for(const shape of original.SHAPES) {
    const target=engine.templateFor(shape.id).map(p=>({x:p.x*120,y:p.y*120}));
    for(const budget of [0,399.999999999,400,900,1600,Infinity]) {
      assert.deepEqual(engine.routeFromTemplate(graph,target,budget),original.routeFromTemplate(graph,target,budget),`${shape.id} @ ${budget}`);
    }
  }
  const repeated=[{x:0,y:0},{x:200,y:0},{x:0,y:0},{x:0,y:200},{x:0,y:0}];
  assert.deepEqual(engine.routeFromTemplate(graph,repeated,2500),original.routeFromTemplate(graph,repeated,2500));
  const missing=[{x:10000,y:10000},...repeated];
  assert.deepEqual(engine.routeFromTemplate(graph,missing,2500),original.routeFromTemplate(graph,missing,2500));
});
