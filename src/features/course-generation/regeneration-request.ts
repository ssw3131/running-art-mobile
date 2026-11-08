import type { GenerationConditions } from './model';
let pending:{id:string;owner:string;conditions:GenerationConditions}|null=null;
export function requestRegeneration(owner:string,conditions:GenerationConditions){
  const id=String(Date.now());pending={id,owner,conditions:JSON.parse(JSON.stringify(conditions))};return id;
}
export function consumeRegeneration(id:string,owner:string){
  const request=pending;pending=null;
  return request?.id===id&&request.owner===owner?request.conditions:null;
}
