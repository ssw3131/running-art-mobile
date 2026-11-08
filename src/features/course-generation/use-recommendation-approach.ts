import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { courseFromCalculation } from '@/features/route-lab/saved-course';
import type { LabCalculation } from '@/features/route-lab/session';
import { planApproach } from '@/modules/running/navigation';
export type WalkingDistance={kind:'loading'|'error'|'ready';distanceM?:number};
/** Walking graph, never straight-line distance. One candidate at a time on low-memory phones. */
export function useRecommendationApproach(result:LabCalculation|null,enabled:boolean){
  const [data,setData]=useState<{result:LabCalculation;states:WalkingDistance[]}>();
  const [retry,setRetry]=useState(0);
  useFocusEffect(useCallback(()=>{
    void retry;
    if(!result?.liveRoads||!enabled)return;
    let closed=false,controller:AbortController|undefined;
    const states:WalkingDistance[]=result.result.candidates.map(()=>({kind:'loading'}));
    const publish=()=>{if(!closed)setData({result,states:[...states]});};publish();
    void(async()=>{
      try{
        const permission=await Location.getForegroundPermissionsAsync();if(!permission.granted)throw new Error('Location permission required');
        const fix=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High,mayShowUserSettingsDialog:false});
        if(closed)return;
        if(fix.coords.accuracy===null||fix.coords.accuracy>30||Date.now()-fix.timestamp>15000)throw new Error('Accurate current location required');
        const position:[number,number]=[fix.coords.longitude,fix.coords.latitude];
        for(let index=0;index<states.length;index++){
          if(closed)return;
          controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),30000);
          try{
            const course=courseFromCalculation(result,index);
            const distanceM=(await planApproach({course,position,accuracy:fix.coords.accuracy},controller.signal)).distanceM;
            states[index]={kind:'ready',distanceM};
          }catch{states[index]={kind:'error'};}finally{clearTimeout(timeout);}
          publish();
        }
      }catch{for(let i=0;i<states.length;i++)states[i]={kind:'error'};publish();}
    })();
    const background=AppState.addEventListener('change',state=>{if(state!=='active'){closed=true;controller?.abort();}else setRetry(value=>value+1);});
    return()=>{closed=true;controller?.abort();background.remove();};
  },[result,enabled,retry]));
  return data?.result===result?data.states:[];
}
