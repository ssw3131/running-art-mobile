import fs from 'node:fs';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { createRoadCache,migrateRoadCache } from '../../src/modules/road-data/persistent-cache.ts';
import { createRoadLoader } from '../../src/modules/road-data/client.ts';
import { codecs } from '../road-data/common.mjs';
import { buildGraph,toLatLng } from '../../src/modules/route-engine/engine.ts';
import { createApproachPlanner } from '../../src/modules/running/approach.ts';
import { courseProjection } from '../../src/modules/guidance/loop-engine.ts';
const dir='.cache/free-loop-qa',fixture=JSON.parse(fs.readFileSync(`${dir}/fixture.json`,'utf8'));
const db=openSqlite(`${dir}/public-roads.db`);await migrateRoadCache(db);
const cache=createRoadCache(db,codecs),attempts=[];
const load=createRoadLoader({getCache:async()=>cache,fetcher:fetch,supply:'national',onAttempt:e=>attempts.push(e)});
try {
  const roads=await load(fixture.snapshot.origin,2000,new AbortController().signal);
  const graph=buildGraph(roads.elements,fixture.snapshot.origin,2000);
  let approach;
  for(const n of graph.nodes){
    if(!n.links.length)continue;const [lat,lng]=toLatLng(n,graph.origin),position=[lng,lat];
    const separation=courseProjection(fixture.snapshot.route,position).separation;
    if(separation<65||separation>100)continue;
    try{const plan=await createApproachPlanner(load)({course:fixture.snapshot,position,accuracy:5},new AbortController().signal);if(plan.distanceM>50&&plan.distanceM<300){approach={position,plan};break;}}catch{}
  }
  if(!approach)throw new Error('No road-connected approach fixture');
  const offline=await createApproachPlanner((o,r,s)=>load(o,r,s,'offline'))({course:fixture.snapshot,position:approach.position,accuracy:5},new AbortController().signal);
  if(JSON.stringify(offline)!==JSON.stringify(approach.plan))throw new Error('Offline approach differs');
  fs.writeFileSync(`${dir}/approach.json`,JSON.stringify(approach));
  fs.writeFileSync(`${dir}/road-report.json`,JSON.stringify({meters:approach.plan.distanceM,points:approach.plan.path.length,offlineEqual:true,attempts},null,2));
  console.log(JSON.stringify({meters:approach.plan.distanceM,points:approach.plan.path.length,offlineEqual:true,loads:attempts.length}));
} finally {await db.closeAsync();}
