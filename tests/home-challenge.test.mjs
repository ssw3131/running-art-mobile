import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {badgeProgress} from '../src/modules/achievements/catalog.ts';
import {recommendHomeBadge} from '../src/modules/home/recommendation.ts';

test('the native home visual fixture has exactly one easiest goal for every random seed',()=>{
 const f=JSON.parse(readFileSync(new URL('../scripts/qa/home-visual-fixture.json',import.meta.url),'utf8'));
 const records=f.shapes.map((shape,i)=>({id:String(i),status:'completed',startedAt:f.startedAt+i*1000,courseId:String(i),courseOutcome:'finished',shape,targetKm:f.targetKm,activeMs:f.activeMsPerRun,distanceM:i===f.shapes.length-1?f.totalDistanceM-f.baseDistanceM*(f.shapes.length-1):f.baseDistanceM}));
 const badges=badgeProgress(records);
 for(let i=0;i<=1000;i++)assert.equal(recommendHomeBadge(badges,i/1000).badge.definition.id,'distance-10');
});

test('random recommendations are unearned, actionable, and stable for a session seed',()=>{
 const badges=badgeProgress([]),a=recommendHomeBadge(badges,0),b=recommendHomeBadge(badges,.99);
 assert.equal(a.badge.definition.kind,'shape');assert.equal(a.remaining,1);assert.notEqual(a.badge.definition.id,b.badge.definition.id);
 assert.deepEqual(recommendHomeBadge(badges,0),a);
 const earned=badges.map(v=>v.definition.id===a.badge.definition.id?{...v,earned:true}:v);
 assert.notEqual(recommendHomeBadge(earned,0).badge.definition.id,a.badge.definition.id);
 assert.equal(recommendHomeBadge(badges.map(v=>({...v,earned:true})),.4),null);
});
test('nearest collection goal targets its missing shape; unsupported variations are not misleading one-run offers',()=>{
 const badges=badgeProgress([]).map(v=>v.definition.id==='collection-3'?{...v,progress:2,completedShapes:['heart','star']}:v);
 for(const seed of [0,.2,.4,.8,.99]){
  const rec=recommendHomeBadge(badges,seed);assert.equal(rec.remaining,1);assert.ok(!['distance-variation','region-variation','repeat'].includes(rec.badge.definition.kind));
  if(rec.badge.definition.id==='collection-3')assert.ok(!['heart','star'].includes(rec.shape));
 }
});
