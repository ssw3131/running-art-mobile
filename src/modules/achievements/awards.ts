import type { AchievementRun } from './model.ts';
export const collectibleShapes=['heart','star','cloud','crown','icecream','strawberry','fish','bone','whale','turtle','cat','dog'] as const;
export const badgeCategories={geometry:['heart','star'],objects:['icecream','crown','bone'],animals:['fish','whale','turtle','cat','dog']} as const;
export type Award={id:string;label:string};
export function achievementAwards(records:readonly AchievementRun[], generated=false):Award[]{
  const unique=[...new Map(records.filter(r=>r.status==='completed').map(r=>[r.id,r])).values()];
  const finished=unique.filter(r=>r.courseId&&r.courseOutcome==='finished');
  const shapes=new Set(finished.map(r=>r.shape).filter((s):s is string=>!!s&&collectibleShapes.includes(s as typeof collectibleShapes[number])));
  const awards:Award[]=[];
  const add=(id:string,label:string,earned:boolean)=>{if(earned)awards.push({id,label});};
  add('first-generation','첫 스케치',generated||finished.length>0);
  add('first-finish','첫 작품',finished.length>0);
  for(const n of [3,6,12])add(`collection-${n}`,`${n}종 수집`,shapes.size>=n);
  for(const [id,items] of Object.entries(badgeCategories))add(id,({geometry:'기하 도형',objects:'사물 도형',animals:'동물 도형'} as Record<string,string>)[id],items.every(s=>shapes.has(s)));
  const distances=new Map<string,Set<number>>(),regions=new Map<string,Set<string>>(),repeats=new Map<string,number>();
  for(const run of finished){
    if(!run.shape)continue;
    if(Number.isFinite(run.targetKm)&&run.targetKm!>0){const set=distances.get(run.shape)??new Set<number>();set.add(Math.round(run.targetKm!*1000));distances.set(run.shape,set);}
    if(run.region){const set=regions.get(run.shape)??new Set<string>();set.add(run.region);regions.set(run.shape,set);}
    const key=run.courseHash||run.courseId!;repeats.set(key,(repeats.get(key)??0)+1);
  }
  add('distance-variation','거리 변주',[...distances.values()].some(set=>set.size>=3));
  add('region-variation','장소 변주',[...regions.values()].some(set=>set.size>=3));
  add('repeat-5','같은 코스 5회 완주',[...repeats.values()].some(n=>n>=5));
  const distance=unique.reduce((s,r)=>s+Math.max(0,r.distanceM),0),time=unique.reduce((s,r)=>s+Math.max(0,r.activeMs),0);
  for(const km of [10,50,100,300])add(`distance-${km}`,`누적 ${km}km`,distance>=km*1000);
  for(const hours of [5,50,100,500])add(`time-${hours}`,`누적 ${hours}시간`,time>=hours*3600000);
  return awards;
}
