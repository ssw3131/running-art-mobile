// Reproducible public-fixture comparison, not a nationwide coverage claim.
import fs from 'node:fs';
import {buildGraph,search} from '../../src/modules/route-engine/engine.ts';
import {generationRadiusKm} from '../../src/modules/route-engine/service-shapes.ts';
import {walkingFieldSteps,joinFromField} from '../../src/modules/route-engine/walking.ts';
import {calculateRoute} from '../../src/modules/route-engine/runner.ts';
const finish=g=>{let r;do{r=g.next();}while(!r.done);return r.value;};
const customTemplate=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:0,y:0}];
const records=[];
for(const fixture of ['grid','seoul'])for(const targetKm of [1,2,3,5,10,20])for(const shape of ['heart','custom']){
 const input=JSON.parse(fs.readFileSync(`assets/route-lab/${fixture}.json`));
 const options={version:'0.2',mode:'free-loop',shape,targetKm,radiusKm:generationRadiusKm(targetKm),shapeVersion:'figma-20261024',maxRouteKm:20,...(shape==='custom'?{customTemplate}:{})};
 const graph=buildGraph(input.elements,input.origin,options.radiusKm*1000);
 let at=performance.now();const previous=search(graph,options),oldMs=performance.now()-at;
 at=performance.now();const current=search(graph,{...options,proximity:'nearby-v1'}),newMs=performance.now()-at;
 // The worker and device both execute this cooperative entry point.
 const device=await calculateRoute({...input,options:{...options,proximity:'nearby-v1'}},{scheduler:{now:()=>performance.now(),yieldToHost:async()=>{}}});
 if(JSON.stringify(device.result)!==JSON.stringify(current))throw new Error('Cooperative/device result mismatch');
 const nodes=new Map(graph.nodes.map(n=>[`${n.x},${n.y}`,n.id]));let field;try{field=finish(walkingFieldSteps(graph,{x:0,y:0}));}catch{}
 const oldAccess=previous.candidates.map(c=>field?joinFromField(field,c.route.map(p=>nodes.get(`${p.x},${p.y}`)))?.distanceM??null:null);
 const best=c=>c.length?Math.max(...c.map(c=>c.score.raw)):null;
 const row={fixture,targetKm,shape,oldMs,newMs,oldCount:previous.candidates.length,newCount:current.candidates.length,oldBest:best(previous.candidates),newBest:best(current.candidates),nearScore:current.candidates[0]?.score.raw??null,scoreGap:current.candidates.length?best(current.candidates)-current.candidates[0].score.raw:null,oldAccess,newAccess:current.candidates.map(c=>c.approach?.distanceM??null),stages:current.proximity.stages,comparison:current.proximity.comparisonRequired,defaultIndex:current.proximity.defaultIndex};
 if(current.stats.valid<current.candidates.length)throw new Error('Valid count omits nearby candidates');
 if(row.oldBest!==null&&(row.newBest===null||row.newBest<row.oldBest-1e-9))throw new Error(`Global quality regressed: ${JSON.stringify(row)}`);
 if(row.defaultIndex!==null&&!(row.newAccess[row.defaultIndex]!==null&&row.newAccess[row.defaultIndex]<=1000))throw new Error('Invalid nearby default');
 records.push(row);console.log(JSON.stringify(row));
}
fs.mkdirSync('test-results/nearby',{recursive:true});fs.writeFileSync('test-results/nearby/quality.json',JSON.stringify({environment:'Public fixed fixtures; 20km coverage limited by fixture extent',records},null,2));
