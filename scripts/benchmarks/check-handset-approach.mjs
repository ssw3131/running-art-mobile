// Network preflight only; these desktop numbers are NOT handset measurements.
import fs from 'node:fs';
import {openSqlite} from '../../tests/helpers/sqlite.mjs';
import {createRoadCache,migrateRoadCache} from '../../src/modules/road-data/persistent-cache.ts';
import {mobileRoadCodecs} from '../../src/modules/road-data/mobile-codecs.ts';
import {runApproachBenchmark} from '../../src/features/approach-benchmark/runner.ts';
const directory='test-results/nearby';fs.mkdirSync(directory,{recursive:true});
const file=`${directory}/handset-preflight.db`;
const report=await runApproachBenchmark({count:2,signal:new AbortController().signal,fetcher:fetch,yieldToHost:()=>new Promise(r=>setImmediate(r)),
 openCache:async()=>{const db=openSqlite(file);await migrateRoadCache(db);return createRoadCache(db,mobileRoadCodecs);},
 emit:row=>console.log(JSON.stringify({iteration:row.iteration,version:row.version,condition:row.condition,ok:row.ok,error:row.error})),
});
fs.writeFileSync(`${directory}/handset-preflight.json`,JSON.stringify(report,null,2));
if(report.rows.length!==16||report.rows.some(r=>!r.ok))throw Error('Benchmark preflight failed');
for(const iteration of [0,1])for(const condition of ['cold','file','graph','plan']){
 const rows=report.rows.filter(r=>r.iteration===iteration&&r.condition===condition);
 if(Math.abs(rows[0].distanceM-rows[1].distanceM)>1||Math.abs(rows[0].targetM-rows[1].targetM)>1)throw Error('Baseline/current path mismatch');
}
console.log('Preflight: 16 samples, cache provenance and baseline/current path match passed.');
