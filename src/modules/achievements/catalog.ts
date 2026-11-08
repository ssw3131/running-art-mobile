import { badgeCategories, collectibleShapes } from './awards.ts';
import type { AchievementRun } from './model.ts';
import { courseShapes } from '../courses/model.ts';

export type BadgeRecord=AchievementRun&{courseName:string|null;reason:string|null;originLat:number|null;originLng:number|null};
export type BadgeDefinition={id:string;kind:'shape'|'collection'|'category'|'distance-variation'|'region-variation'|'repeat'|'distance'|'time';group:string;title:string;accent:string;subtitle:string;condition:string;goal:number;shapes?:readonly string[]};
export const badgeCatalog:readonly BadgeDefinition[]=[
  ...collectibleShapes.map(shape=>({id:shape,kind:'shape' as const,group:'도형별 첫 완주',title:`${courseShapes[shape]} 코스`,accent:'첫 완주',subtitle:'뱃지',condition:'해당 도형의 코스를 처음 완주하면 최초 1회 획득해요.',goal:1,shapes:[shape]})),
  ...[3,6,12].map(n=>({id:`collection-${n}`,kind:'collection' as const,group:'모양 코스 누적 완주',title:`코스 ${n}종`,accent:'누적 완주',subtitle:'뱃지',condition:`서로 다른 도형의 코스를 ${n}종 완주`,goal:n,shapes:collectibleShapes})),
  ...Object.entries(badgeCategories).map(([id,shapes])=>({id,kind:'category' as const,group:'카테고리별 완주',title:`${({geometry:'기하',objects:'사물',animals:'동물'} as Record<string,string>)[id]} 코스`,accent:`${shapes.length}종 완주`,subtitle:'뱃지',condition:`${shapes.map(shape=>courseShapes[shape]).join(' · ')} 코스를 각각 완주`,goal:shapes.length,shapes})),
  {id:'distance-variation',kind:'distance-variation',group:'변주 3회 최초 완주',title:'거리 변주',accent:'최초 3회',subtitle:'뱃지',condition:'같은 도형의 코스를 서로 다른 목표 거리로 3번 완주',goal:3},
  {id:'region-variation',kind:'region-variation',group:'변주 3회 최초 완주',title:'장소 변주',accent:'3회',subtitle:'뱃지',condition:'같은 도형의 코스를 서로 다른 지역 3곳에서 완주',goal:3},
  {id:'repeat-5',kind:'repeat',group:'동일 코스 반복 완주',title:'동일 코스',accent:'5회 반복 완주',subtitle:'뱃지',condition:'동일한 코스를 5회 완주',goal:5},
  ...[10,50,100,300].map(km=>({id:`distance-${km}`,kind:'distance' as const,group:'누적 거리 달성',title:'누적 거리',accent:`${km}km`,subtitle:'뱃지',condition:`활동 거리가 누적 ${km}km에 도달`,goal:km*1000})),
  ...[5,50,100,500].map(hours=>({id:`time-${hours}`,kind:'time' as const,group:'누적 시간 달성',title:'누적 시간',accent:`${hours}시간`,subtitle:'뱃지',condition:`러닝 누적 시간이 ${hours}시간에 도달`,goal:hours*3600000})),
];
export type BadgeProgress={definition:BadgeDefinition;progress:number;earned:boolean;earnedAt:number|null;runIds:string[];completedShapes:string[]};
/** Rebuilt from owned records, including after deletion/restore. No separately mutable badge flags. */
export function badgeProgress(records:readonly BadgeRecord[]):BadgeProgress[]{
  const unique=[...new Map(records.filter(r=>r.status==='completed').map(r=>[r.id,r])).values()].sort((a,b)=>a.startedAt-b.startedAt||a.id.localeCompare(b.id));
  const finished=unique.filter(r=>r.courseId&&r.courseOutcome==='finished');
  return badgeCatalog.map(definition=>{
    let progress=0,evidence:BadgeRecord[]=[],completedShapes:string[]=[];
    if(definition.kind==='distance'||definition.kind==='time'){
      for(const run of unique){const value=Math.max(0,definition.kind==='distance'?run.distanceM:run.activeMs);if(progress<definition.goal&&value>0)evidence.push(run);progress+=value;}
    }else if(['shape','collection','category'].includes(definition.kind)){
      const seen=new Set<string>();
      for(const run of finished){if(!run.shape||!definition.shapes?.includes(run.shape))continue;
        if(!seen.has(run.shape)){seen.add(run.shape);if(evidence.length<definition.goal)evidence.push(run);}}
      completedShapes=[...seen];progress=seen.size;
    }else{
      const groups=new Map<string,BadgeRecord[]>(),seen=new Map<string,Set<string>>();
      for(const run of finished){
        if(!run.shape)continue;
        const group=definition.kind==='repeat'?(run.courseHash||run.courseId!):run.shape;
        const value=definition.kind==='distance-variation'?Number.isFinite(run.targetKm)&&run.targetKm!>0?String(Math.round(run.targetKm!*1000)):null:definition.kind==='region-variation'?run.region??null:run.id;
        if(value===null)continue;
        const keys=seen.get(group)??new Set<string>();if(keys.has(value))continue;keys.add(value);seen.set(group,keys);
        const list=groups.get(group)??[];list.push(run);groups.set(group,list);
      }
      const lists=[...groups.values()];
      const completed=lists.filter(list=>list.length>=definition.goal).sort((a,b)=>a[definition.goal-1].startedAt-b[definition.goal-1].startedAt||a[definition.goal-1].id.localeCompare(b[definition.goal-1].id));
      const best=completed[0]??lists.sort((a,b)=>b.length-a.length)[0]??[];
      progress=best.length;evidence=best.slice(0,definition.goal);
    }
    const earned=progress>=definition.goal;
    return {definition,progress,earned,earnedAt:earned?evidence.at(-1)?.startedAt??null:null,runIds:evidence.map(run=>run.id),completedShapes};
  });
}
