import fs from 'node:fs';
import { calculateRoute } from '../../src/modules/route-engine/runner.ts';
const rows=[];
for(const dataset of ['grid','seoul'])for(const mode of ['anchored','free-loop']){
  const input=JSON.parse(fs.readFileSync(`assets/route-lab/${dataset}.json`,'utf8'));
  input.options={...input.options,mode,version:'0.2',shape:'heart',targetKm:5,radiusKm:2};
  const runs=[];
  for(let i=0;i<3;i++){const result=await calculateRoute(input);runs.push({elapsedMs:result.metrics.elapsedMs,maxSliceMs:result.metrics.maxSliceMs,yields:result.metrics.yields,candidates:result.result.candidates.length,best:result.result.candidates[0]?.score.raw,placements:result.result.stats.placements});}
  const row={dataset,mode,runs,medianMs:runs.map(r=>r.elapsedMs).sort((a,b)=>a-b)[1]};rows.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync('.cache/free-loop-qa/performance.json',JSON.stringify({date:'2026-10-04',environment:'Windows Node 24.21.0, API 36 emulator concurrently running',note:'Search rules differ; times describe the new scope and do not prove equivalent-result optimization.',rows},null,2));
