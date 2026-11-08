import type { GuidanceOptions } from '@/modules/running/guidance';
type Session={owner:string;options:GuidanceOptions;ended:boolean};
const sessions=new Map<string,Session>();
/** Screen-to-screen controls only; no account preferences or run repository writes. */
export const simulationSettings={
 create(owner:string,options:GuidanceOptions){const id=`${Date.now()}-${Math.random().toString(36).slice(2)}`;sessions.set(id,{owner,options:{...options,background:false},ended:false});return id;},
 get(id:string,owner:string){const value=sessions.get(id);return value?.owner===owner?{...value,options:{...value.options}}:null;},
 set(id:string,owner:string,options:GuidanceOptions){const value=sessions.get(id);if(!value||value.owner!==owner||value.ended)throw new Error('시뮬레이션 설정을 다시 열어 주세요.');value.options={...options,background:false};},
 end(id:string,owner:string){const value=sessions.get(id);if(value?.owner===owner)value.ended=true;},
 clear(id:string){sessions.delete(id);},
};
