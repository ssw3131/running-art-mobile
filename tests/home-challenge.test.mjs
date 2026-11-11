import assert from 'node:assert/strict';
import test from 'node:test';
import {badgeProgress} from '../src/modules/achievements/catalog.ts';
import {recommendHomeBadge} from '../src/modules/home/recommendation.ts';

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
