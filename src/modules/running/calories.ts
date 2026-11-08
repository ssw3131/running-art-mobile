import { StorageError } from '../storage/types.ts';
export const MIN_WEIGHT_KG=10,MAX_WEIGHT_KG=500;
export function validateWeightKg(value:unknown):number{
 if(typeof value!=='number'||!Number.isFinite(value)||value<MIN_WEIGHT_KG||value>MAX_WEIGHT_KG||Math.abs(value*10-Math.round(value*10))>1e-7)throw new StorageError('validation','체중은 10~500kg 사이, 소수점 한 자리까지 입력해 주세요.');
 return Math.round(value*10)/10;
}
export function parseWeightKg(text:string):number|undefined{
 const normalized=text.normalize('NFKC').trim().replace(',','.');if(!normalized)return undefined;
 if(!/^\d{1,3}(?:\.\d)?$/.test(normalized))throw new StorageError('validation','체중은 10~500kg 사이, 소수점 한 자리까지 입력해 주세요.');
 return validateWeightKg(Number(normalized));
}
/** Approximate running cost: 1 kcal/kg/km, rounding Mayhew (1977)'s 0.97.
 * https://pubmed.ncbi.nlm.nih.gov/922272/ — not a measurement; ignores terrain and individual economy.
 * Use the recorded distance, never the planned course length. Simulations are hypothetical only.
 */
export function estimatedRunningKcal(distanceM:number,weightKg:number|undefined):number|null{
 if(weightKg===undefined||!Number.isFinite(distanceM)||distanceM<0)return null;
 try{const value=validateWeightKg(weightKg)*(distanceM/1000);return Number.isFinite(value)?Math.round(value):null;}catch{return null;}
}
