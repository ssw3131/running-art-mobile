import type { Origin } from '../route-engine/types.ts';
export function regionLabel(value:unknown):string|null{
 const features=(value as {features?:{id?:string;text?:string;context?:{id?:string;text?:string}[]}[]})?.features;
 if(!Array.isArray(features))return null;
 const entries=features.flatMap(f=>[f,...(f.context??[])]).filter(e=>typeof e.id==='string'&&typeof e.text==='string');
 const order=['region','municipality','municipal_district','locality','neighbourhood'];
 const names=order.flatMap(kind=>entries.filter(e=>e.id!.startsWith(kind+'.')&&/[시도군구읍면동]$/.test(e.text!)).map(e=>e.text!));
 return [...new Set(names)].join(' ')||null;
}
const cache=new Map<string,string>();
let queue:Promise<unknown>=Promise.resolve();
export function loadRegionLabel(origin:Origin,key:string|undefined,signal:AbortSignal){
 const result=queue.catch(()=>{}).then(()=>readRegionLabel(origin,key,signal));queue=result.catch(()=>{});return result;
}
async function readRegionLabel(origin:Origin,key:string|undefined,signal:AbortSignal){
 if(signal.aborted)throw new Error('Cancelled');
 if(!key||!Number.isFinite(origin.lat)||!Number.isFinite(origin.lng)||origin.lat<33||origin.lat>=39||origin.lng<124||origin.lng>=132)throw new Error('Region unavailable');
 const id=`${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`,cached=cache.get(id);if(cached)return cached;
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 const timeout=setTimeout(abort,10000);
 try{
  const params=new URLSearchParams({key,language:'ko',limit:'1',types:'municipality,municipal_district,locality,neighbourhood'});
  const result=await fetch(`https://api.maptiler.com/geocoding/${origin.lng},${origin.lat}.json?${params}`,{signal:controller.signal,credentials:'omit'});
  if(!result.ok)throw new Error('Region unavailable');
  const label=regionLabel(await result.json());if(!label)throw new Error('Region unavailable');
  if(signal.aborted)throw new Error('Cancelled');
  cache.set(id,label);if(cache.size>256)cache.delete(cache.keys().next().value!);return label;
 }finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);}
}
