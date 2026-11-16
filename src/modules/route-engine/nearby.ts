import type { EvaluatedCandidate, SearchResult } from './types.ts';
import { joinFromField, type WalkingField, type WalkingJoin } from './walking.ts';
import { MIN_RECOMMENDATION_SCORE } from './nearby-policy.ts';
export type NearbyCandidate=EvaluatedCandidate&{approach:WalkingJoin|null;recommendation:'nearby'|'shape'|'far'|'unknown'};
export function selectNearby(candidates:EvaluatedCandidate[],field:WalkingField|null,stages:number[],overlap:(a:EvaluatedCandidate['usage']['edges'],b:EvaluatedCandidate['usage']['edges'])=>number):{selected:NearbyCandidate[];proximity:NonNullable<SearchResult['proximity']>}{
  return rankNearby(candidates.map(c=>({...c,approach:field?joinFromField(field,c.ids):null,recommendation:'unknown'})),stages,!!field,overlap);
}
export function rankNearby(candidates:NearbyCandidate[],stages:number[],sourceKnown:boolean,overlap:(a:EvaluatedCandidate['usage']['edges'],b:EvaluatedCandidate['usage']['edges'])=>number){
  const ordered=candidates.filter(c=>c.score.raw>=MIN_RECOMMENDATION_SCORE).sort((a,b)=>b.score.raw-a.score.raw);
  const connected=ordered.filter(c=>c.approach),best=connected[0];
  // Keep the best connected representative while applying the existing route
  // overlap limit. A near duplicate cannot displace the global best.
  const distinct=connected.filter(c=>c===best||overlap(c.usage.edges,best.usage.edges)<0.8);
  const tier=[300,500,1000].find(limit=>distinct.some(c=>c.approach!.distanceM<=limit));
  const near=tier===undefined?undefined:distinct.find(c=>c.approach!.distanceM<=tier);
  const selected:NearbyCandidate[]=[];
  for(const c of [near,best,...ordered]){
    if(!c||selected.includes(c)||!selected.every(o=>overlap(c.usage.edges,o.usage.edges)<0.8))continue;
    c.recommendation=c===near?'nearby':c.approach&&c.approach.distanceM>1000?'far':c===best?'shape':c.approach?'nearby':'unknown';
    selected.push(c);if(selected.length===5)break;
  }
  const comparisonRequired=!!near&&!!best&&best.score.raw-near.score.raw>5;
  return {selected,proximity:{stages:[...stages],defaultIndex:near&&!comparisonRequired?selected.indexOf(near):null,comparisonRequired,sourceKnown}};
}
