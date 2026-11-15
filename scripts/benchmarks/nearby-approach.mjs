// CPU comparison on immutable public fixtures. This is NOT a handset/network benchmark.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildGraph,search,toLatLng} from '../../src/modules/route-engine/engine.ts';
import {createApproachPlanner} from '../../src/modules/running/approach.ts';
import {courseFromCalculation} from '../../src/features/route-lab/saved-course.ts';
import {prepareRoute,project} from '../../src/modules/guidance/geometry.ts';
const directory=path.resolve('test-results/nearby');fs.mkdirSync(directory,{recursive:true});
const baseline=execFileSync('git',['show','6a72e7930e01b5e415bed1eb5ea8bbd90571c5a4:src/modules/running/approach.ts'],{encoding:'utf8'}).replace(/from '\.\.\/([^']+)'/g,(_m,p)=>`from '${pathToFileURL(path.resolve('src/modules',p)).href}'`);
fs.writeFileSync(path.join(directory,'baseline-approach.ts'),baseline);
const previous=(await import(pathToFileURL(path.join(directory,'baseline-approach.ts')).href)).createApproachPlanner;
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
const results=[];
for(const fixture of ['grid','seoul']){
 const input=JSON.parse(fs.readFileSync(`assets/route-lab/${fixture}.json`));
 const options={version:'0.2',mode:'free-loop',shape:'heart',targetKm:2,radiusKm:2,shapeVersion:'figma-20261024',maxRouteKm:20};
 const graph=buildGraph(input.elements,input.origin,2000),result=search(graph,{...options,proximity:'nearby-v1'});
 const course=courseFromCalculation({origin:input.origin,options,result,liveRoads:true},0),route=prepareRoute(course.route);
 let request;
 for(const node of graph.nodes){const [lat,lng]=toLatLng(node,input.origin),position=[lng,lat],separation=project(route,position,0,route.totalMeters,0).separation;if(separation<100||separation>700)continue;const r={course,position,accuracy:5};try{await createApproachPlanner(async()=>({elements:input.elements,source:'fixture',cached:true}),async()=>{})(r,new AbortController().signal);request=r;break;}catch{}}
 if(!request)throw new Error(`No connected benchmark position: ${fixture}`);
 const load=async()=>({elements:input.elements,source:'public fixed fixture; no network',cached:true});
 const old=[],cold=[],warm=[],cachedGraph=[];const controller=new AbortController();
 let baselinePlan,plan;
 for(let i=0;i<20;i++){
  let at=performance.now();baselinePlan=await previous(load,async()=>{})(request,controller.signal);old.push(performance.now()-at);
  const planner=createApproachPlanner(load,async()=>{});at=performance.now();plan=await planner(request,controller.signal);cold.push(performance.now()-at);
  at=performance.now();await planner({...request,targetM:Math.min(route.totalMeters,100+i)},controller.signal);cachedGraph.push(performance.now()-at);
  at=performance.now();await planner(request,controller.signal);warm.push(performance.now()-at);
  if(Math.abs(baselinePlan.distanceM-plan.distanceM)>1)throw new Error('Walking distance changed');
 }
 results.push({fixture,count:20,baselineMedian:percentile(old,.5),newMedian:percentile(cold,.5),improvementPercent:(1-percentile(cold,.5)/percentile(old,.5))*100,graphCacheP95:percentile(cachedGraph,.95),planCacheP95:percentile(warm,.95),distanceM:plan.distanceM,straightM:project(route,request.position,0,route.totalMeters,0).separation});
}
const report={environment:'Codex Cloud Node CPU; no GPS, download, SQLite, Hermes or handset measurement',results};fs.writeFileSync(path.join(directory,'cpu.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
