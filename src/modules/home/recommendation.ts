import type { BadgeProgress } from '../achievements/catalog.ts';
import { collectibleShapes } from '../achievements/awards.ts';
import type { ShapeId } from '../route-engine/types.ts';

export type HomeChallenge={badge:BadgeProgress;shape:ShapeId;remaining:number;unit:'회 완주'|'m'|'분'};
/** Recommend actionable, unearned goals with the fewest estimated runs remaining.
 * Variations/repeats require extra route/region conditions, so are not advertised
 * as achievable merely by opening any course of the same shape.
 */
export function recommendHomeBadge(badges:readonly BadgeProgress[],seed:number):HomeChallenge|null{
 const firstMissing=collectibleShapes.find(shape=>!badges.some(b=>b.definition.id===shape&&b.earned))??'heart';
 const candidates=badges.flatMap<HomeChallenge&{effort:number}>(badge=>{
  const d=badge.definition;if(badge.earned)return [];
  const shapes=d.shapes?.filter(shape=>!badge.completedShapes.includes(shape));
  const remaining=Math.max(0,d.goal-badge.progress);
  if(['shape','collection','category'].includes(d.kind)&&shapes?.length)return [{badge,shape:shapes[0] as ShapeId,remaining,unit:'회 완주' as const,effort:remaining}];
  if(d.kind==='distance')return [{badge,shape:firstMissing as ShapeId,remaining:Math.ceil(remaining),unit:'m' as const,effort:Math.ceil(remaining/3000)}];
  if(d.kind==='time')return [{badge,shape:firstMissing as ShapeId,remaining:Math.ceil(remaining/60000),unit:'분' as const,effort:Math.ceil(remaining/1800000)}];
  return [];
 });
 if(!candidates.length)return null;
 const easiest=Math.min(...candidates.map(c=>c.effort));
 const pool=candidates.filter(c=>c.effort===easiest);
 return pool[Math.min(pool.length-1,Math.max(0,Math.floor((Number.isFinite(seed)?seed:0)*pool.length)))];
}
