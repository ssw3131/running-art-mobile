import { useCallback,useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { StyleProp,TextStyle } from 'react-native';
import { AppText } from '@/components/ui';
import { loadRegionLabel } from '@/modules/map/region-label';
export function RegionText({lat,lng,style}:{lat:number|null|undefined;lng:number|null|undefined;style?:StyleProp<TextStyle>}){
 const key=`${lat},${lng}`,[state,setState]=useState({key:'',label:''});
 const valid=typeof lat==='number'&&typeof lng==='number'&&Number.isFinite(lat)&&Number.isFinite(lng);
 useFocusEffect(useCallback(()=>{
  if(!valid)return;const controller=new AbortController();
  void loadRegionLabel({lat:lat!,lng:lng!},process.env.EXPO_PUBLIC_MAPTILER_API_KEY,controller.signal).then(label=>{if(!controller.signal.aborted)setState({key,label});},()=>{if(!controller.signal.aborted)setState({key,label:'지역 확인 불가'});});
  return()=>controller.abort();
 },[key,lat,lng,valid]));
 return <AppText numberOfLines={1} style={[{fontSize:13,lineHeight:18},style]}>{!valid?'지역 정보 없음':state.key===key?state.label:'지역 확인 중…'}</AppText>;
}
