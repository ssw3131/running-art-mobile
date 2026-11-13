import { useCallback,useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { getStorage } from '@/modules/storage/database';
import type { CourseSnapshot } from '@/modules/courses/model';
import { HomePreview } from '@/features/service/HomePreview';
import { usePointAddress } from '@/features/course-generation/use-point-address';
import { roadAddress } from '@/modules/map/road-address';

export function useSavedCoursePresentation(id:string) {
  const auth=useAuth(),owner=auth.account?.id??'',key=`${owner}:${id}`;
  const [state,setState]=useState<{key:string;snapshot?:CourseSnapshot;failed:boolean}>({key:'',failed:false});
  useFocusEffect(useCallback(()=>{
    let live=true;
    const current=()=>live&&(authentication.getSnapshot().account?.id??'')===owner;
    void getStorage().then(db=>db.courses.get(id)).then(saved=>{if(current())setState({key,snapshot:saved.snapshot,failed:false});},()=>{if(current())setState({key,failed:true});});
    return()=>{live=false;};
  },[id,owner,key]));
  const snapshot=state.key===key?state.snapshot:undefined,address=usePointAddress(snapshot?.origin);
  return {snapshot,failed:state.key===key&&state.failed,address:address.address?roadAddress(address.address):address.label};
}
export function SavedCourseThumbnail({snapshot,failed,size=80}:{snapshot?:CourseSnapshot;failed:boolean;size?:number}) {
  return <View style={{width:size,height:size}}><HomePreview paths={snapshot?[snapshot.route]:[]} active={!!snapshot} unavailable={failed} synthetic={snapshot?.source==='synthetic'} label="저장 코스 지도 이미지"/></View>;
}
