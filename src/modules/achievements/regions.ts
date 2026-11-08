import type { Origin } from '../route-engine/types.ts';
/** Use administrative feature IDs, never road names or rounded GPS coordinates. */
export function parseAchievementRegion(value:unknown):string|null{
  const features=(value as {features?:{id?:unknown;text?:unknown;context?:{id?:unknown;text?:unknown}[]}[]})?.features;
  if(!Array.isArray(features))return null;
  const entries=features.flatMap(f=>[f,...(Array.isArray(f.context)?f.context:[])]);
  // Korean 읍·면·동 plus their parent 시·군·구: equal names in different cities stay distinct.
  const fine=entries.find(e=>typeof e.id==='string'&&typeof e.text==='string'&&/[읍면동]$/.test(e.text));
  const parent=entries.filter(e=>typeof e.id==='string'&&typeof e.text==='string'&&/[시군구]$/.test(e.text));
  if(!fine||!parent.length)return null;
  return [...new Set([...parent.map(e=>e.id as string),fine.id as string])].sort().join('|');
}
export async function resolveAchievementRegion(origin:Origin,key:string|undefined,signal:AbortSignal):Promise<string|null>{
  if(!key||!Number.isFinite(origin.lat)||!Number.isFinite(origin.lng)||origin.lat<33||origin.lat>=39||origin.lng<124||origin.lng>=132)return null;
  const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();const timer=setTimeout(abort,10000);
  try{const params=new URLSearchParams({key,language:'ko',limit:'1',types:'municipality,municipal_district,locality,neighbourhood'});const r=await fetch(`https://api.maptiler.com/geocoding/${origin.lng},${origin.lat}.json?${params}`,{signal:controller.signal,credentials:'omit'});if(!r.ok||signal.aborted)return null;return parseAchievementRegion(await r.json());}catch{return null;}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
