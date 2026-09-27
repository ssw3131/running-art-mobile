const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../src/route-engine'),fixture=require('../examples/grid.json');
test('v0.2 keeps baseline quality while varying size, without breaking route limits',()=>{
  const graph=()=>E.buildGraph(fixture.elements,fixture.origin,fixture.options.radiusKm*1000);
  const baseline=E.search(graph(),{...fixture.options,version:'0.1'});
  const refined=E.search(graph(),{...fixture.options,version:'0.2'});
  assert.equal(refined.candidates.length,5);
  assert.ok(refined.candidates[0].score.raw>=baseline.candidates[0].score.raw);
  assert.ok(refined.stats.extraRouted>0&&refined.stats.routed<=420);
  for(const c of refined.candidates){
    assert.ok(c.scaleRatio>=.85-1e-8&&c.scaleRatio<=1.15+1e-8);
    assert.ok(c.score.lengthKm>=3.75&&c.score.lengthKm<=6.25);
    assert.deepEqual(c.route[0],c.route.at(-1));
  }
});
