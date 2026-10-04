// Public OSM sample only; isolated emulator fixtures are never uploaded.
import fs from 'node:fs';
import { calculateRoute } from '../../src/modules/route-engine/runner.ts';
import { courseFromCalculation } from '../../src/features/route-lab/saved-course.ts';
import { encodeSnapshot } from '../../src/modules/courses/model.ts';
import { prepareRoute,positionAt } from '../../src/modules/guidance/geometry.ts';
import { loopAt } from '../../src/modules/guidance/loop-engine.ts';
const folder='.cache/free-loop-qa';fs.mkdirSync(folder,{recursive:true});
const source=JSON.parse(fs.readFileSync('assets/route-lab/seoul.json','utf8'));
const input={...source,options:{...source.options,mode:'free-loop',version:'0.2',shape:'diamond',targetKm:1,radiusKm:2}};
const result=await calculateRoute(input);
if(!result.result.candidates.length)throw new Error('No public OSM fixture loop');
const snapshot=courseFromCalculation({...result,origin:input.origin,options:input.options,liveRoads:true},0);
const prepared=prepareRoute(snapshot.route);
const fixture={id:'f'.repeat(32),name:'QA 자유 출발 순환 코스',...encodeSnapshot(snapshot),
  forward:loopAt(prepared,prepared.totalMeters*.27,1).points,reverse:loopAt(prepared,prepared.totalMeters*.61,-1).points,
  join:positionAt(prepared,prepared.totalMeters*.27),metrics:result.metrics};
fs.writeFileSync(`${folder}/fixture.json`,JSON.stringify(fixture));
console.log(JSON.stringify({meters:prepared.totalMeters,segments:snapshot.roadSegments.length,scores:result.result.candidates.map(c=>c.score.raw),ms:result.metrics.elapsedMs}));
