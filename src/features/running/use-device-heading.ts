import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
/** Shortest-angle smoothing avoids a full camera spin at north (359 -> 0). */
export function useDeviceHeading(enabled:boolean){
  const [heading,setHeading]=useState<number>();
  useFocusEffect(useCallback(()=>{
    if(!enabled)return;
    let alive=true,epoch=0,watch:Location.LocationSubscription|undefined;
    const stop=()=>{epoch++;watch?.remove();watch=undefined;};
    const start=()=>{stop();const current=epoch;void Location.watchHeadingAsync(value=>{
      if(!alive||epoch!==current||value.accuracy===0)return;
      const next=value.trueHeading>=0?value.trueHeading:value.magHeading;
      if(!Number.isFinite(next))return;
      setHeading(old=>old===undefined?next:Math.abs(((next-old+540)%360)-180)<2?old:(old+(((next-old+540)%360)-180)*.35+360)%360);
    }).then(value=>{if(alive&&epoch===current)watch=value;else value.remove();},()=>{});};
    if(AppState.currentState==='active')start();const lifecycle=AppState.addEventListener('change',value=>value==='active'?start():stop());
    return()=>{alive=false;stop();lifecycle.remove();};
  },[enabled]));
  return heading;
}
