import { useCallback, useState } from 'react';
import type { Position } from '@/modules/location/locate';
import { useFocusEffect } from 'expo-router';
import { courseFromCalculation } from '@/features/route-lab/saved-course';
import type { LabCalculation } from '@/features/route-lab/session';
import { planApproach } from '@/modules/running/navigation';
import { handoffApproach } from '@/modules/running/approach-cache';
import { toLatLng } from '@/modules/route-engine/engine';
import { prepareRoute, type Coordinate } from '@/modules/guidance/geometry';
export type WalkingDistance={kind:'loading'|'error'|'ready';distanceM?:number};
/** Display distances from the selected origin; GPS belongs to running preparation. */
export function useRecommendationApproach(result:LabCalculation|null,enabled:boolean,selected=0,current:Position|null=null){
  useFocusEffect(useCallback(()=>{
    if(!enabled||!result?.liveRoads||selected<0||!current||current.accuracy===null||current.accuracy>30||Date.now()-current.timestamp>5000)return;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    void planApproach({course:courseFromCalculation(result,selected),position:[current.longitude,current.latitude],accuracy:current.accuracy},controller.signal).catch(()=>{}).finally(()=>clearTimeout(timer));
    return()=>{handoffApproach(controller);clearTimeout(timer);};
  },[result,selected,enabled,current]));
  const [data,setData]=useState<{result:LabCalculation;states:WalkingDistance[]}>();
  useFocusEffect(useCallback(()=>{
    if(!result?.liveRoads||!enabled)return;
    let closed=false;const controller=new AbortController();
    const states:WalkingDistance[]=result.result.candidates.map(c=>c.approach?{kind:'ready',distanceM:c.approach.distanceM}:result.result.proximity?{kind:'error'}:{kind:'loading'});
    const publish=()=>{if(!closed)setData({result,states:[...states]});};publish();
    void(async()=>{
      const order=[selected,...states.map((_,i)=>i)].filter((v,i,a)=>v>=0&&a.indexOf(v)===i);
      for(const index of order){
        if(closed)return;
        const course=courseFromCalculation(result,index),candidate=result.result.candidates[index],a=candidate.approach;
        const position:Coordinate=[result.origin.lng,result.origin.lat];
        if(a){
          // Convert engine planar arclength to saved geographic arclength without
          // projecting onto a different occurrence at a course self-crossing.
          const route=prepareRoute(course.route);let m=0,targetM=route.totalMeters;
          for(let i=1;i<candidate.route.length;i++){const x=candidate.route[i-1],y=candidate.route[i],length=Math.hypot(y.x-x.x,y.y-x.y);if(m+length>=a.targetM){targetM=route.cumulative[i-1]+(length?(a.targetM-m)/length:0)*(route.cumulative[i]-route.cumulative[i-1]);break;}m+=length;}
          const path=a.path.map(p=>{const [lat,lng]=toLatLng(p,result.origin);return [lng,lat] as Coordinate;});
          try{planApproach.seed?.({course,position,accuracy:30},{path,targetM,distanceM:a.distanceM},a.source,result.roadVersion??result.roadCache?.manifestHash??'unversioned');}catch{/* Never trust an unusable seed for a running start. */}
          continue;
        }
        if(result.result.proximity)continue;
        const timeout=setTimeout(()=>controller.abort(),10000);
        try{states[index]={kind:'ready',distanceM:(await planApproach({course,position,accuracy:30},controller.signal)).distanceM};}
        catch{states[index]={kind:'error'};}finally{clearTimeout(timeout);}
        publish();
      }
    })();
    return()=>{closed=true;handoffApproach(controller);};
  },[result,enabled,selected]));
  return data?.result===result?data.states:[];
}
