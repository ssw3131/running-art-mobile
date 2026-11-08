import { useCallback,useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { getStorage } from '@/modules/storage/database';
import { resolveAchievementRegion } from '@/modules/achievements/regions';
import type { AchievementsRepository } from '@/modules/achievements/repository';
export type BadgeGalleryData=Awaited<ReturnType<AchievementsRepository['gallery']>>;
export function useBadgeGallery(){
 const auth=useAuth(),owner=auth.ready?auth.account?.id??'':null;
 const [state,setState]=useState<{owner:string|null;data:BadgeGalleryData|null;error:string}>({owner:null,data:null,error:''}),[attempt,setAttempt]=useState(0);
 useFocusEffect(useCallback(()=>{
  void attempt;
  if(owner===null)return;let live=true,busy=false;const controller=new AbortController();
  const read=async()=>{if(!live||busy)return;busy=true;try{
   const data=await(await getStorage()).achievements.gallery();
   if(live&&(authentication.getSnapshot().account?.id??'')===owner)setState({owner,data,error:''});
  }catch{if(live)setState({owner,data:null,error:'뱃지를 불러오지 못했어요. 다시 확인해 주세요.'});}finally{busy=false;}};
  void read();
  void getStorage().then(db=>db.achievements.resolveRegions((point,signal)=>resolveAchievementRegion(point,process.env.EXPO_PUBLIC_MAPTILER_API_KEY,signal),controller.signal)).then(()=>{if(live)void read();}).catch(()=>{});
  const subscription=AppState.addEventListener('change',value=>{if(value==='active')void read();});
  return()=>{live=false;controller.abort();subscription.remove();};
 },[owner,attempt]));
 return {data:state.owner===owner?state.data:null,error:state.owner===owner?state.error:'',retry:()=>setAttempt(value=>value+1)};
}
