import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { useSavedCoursePresentation, SavedCourseThumbnail } from './SavedCoursePresentation';
import { getStorage } from '@/modules/storage/database';
import { courseErrorMessage, type CourseSummary } from '@/modules/courses/model';
import { useThemeColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { UsagePanel } from '@/features/usage/UsagePanel';
import { estimatedRunningMinutes } from '@/features/course-generation/recommendation-metrics';

function CourseRow({course,selected,onSelect}:{course:CourseSummary;selected:boolean;onSelect():void}){
 const c=useThemeColors(),preview=useSavedCoursePresentation(course.id);
 return <Link href={{pathname:'/courses/[id]',params:{id:course.id}}} asChild>
  <Pressable testID={`course-row-${course.id}`} accessibilityRole="button" accessibilityState={{selected}} onPress={onSelect} style={{minHeight:100,padding:10,borderRadius:radius.card,backgroundColor:c.surface,borderWidth:selected?1:0,borderColor:c.selected,boxShadow:'0px 0px 5px rgba(0,0,0,0.15)',flexDirection:'row',alignItems:'center',gap:16}}>
   <SavedCourseThumbnail snapshot={preview.snapshot} failed={preview.failed}/>
   <View style={{flex:1,gap:3}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:6}}><AppText weight="bold" numberOfLines={2} style={{flexShrink:1}}>{course.name}</AppText>{course.unfinished&&<AppText variant="caption" weight="bold" style={{fontSize:10,color:c.onAction,backgroundColor:c.selected,borderRadius:10,paddingHorizontal:6}}>미완주</AppText>}</View>
    <AppText variant="label" weight="bold">{course.lengthKm.toFixed(2)} km</AppText>
    <AppText variant="caption" weight="bold">약 {estimatedRunningMinutes(course.lengthKm)}분</AppText>
    <AppText numberOfLines={1} variant="caption" style={{color:c.muted}}>{preview.failed?'주소를 확인하지 못했어요.':preview.address}</AppText>
   </View><Icon name="chevronRight" color={c.outline}/>
  </Pressable>
 </Link>;
}
const PAGE=30;
export default function CoursesScreen({embedded=false}:{embedded?:boolean}) {
  const c=useThemeColors(),auth=useAuth(),owner=auth.ready ? auth.account?.id??'' : null;
  const [state,setState]=useState<{owner:string|null;rows:CourseSummary[];active:string|null;total:number;more:boolean;ready:boolean;error:string}>({owner:null,rows:[],active:null,total:0,more:false,ready:false,error:''});
  const [busy,setBusy]=useState(false), generation=useRef(0),loading=useRef(false),loaded=useRef(PAGE);
  const [refreshing,setRefreshing]=useState(false);
  const [selection,setSelection]=useState<{owner:string;id:string}|null>(null);
  const current=owner!==null && state.owner===owner;
  const fetchPage=useCallback(async(offset:number)=>{
    if(loading.current || owner===null)return;
    const request=++generation.current;loading.current=true;setBusy(true);
    if(!offset)setState(old=>old.owner===owner?{...old,error:''}:{owner,rows:[],active:null,total:0,more:false,ready:false,error:''});
    try {
      const db=await getStorage();
      const take=offset?PAGE:loaded.current,items:CourseSummary[]=[];
      for(let start=0;start<take+1;start+=100)items.push(...await db.courses.list(Math.min(100,take+1-start),offset+start));
      const active=await db.runs.active(),total=await db.courses.count();
      if(request===generation.current){loaded.current=offset+Math.min(items.length,take);setState(old=>({owner,rows:offset?[...old.rows,...items.slice(0,take)]:items.slice(0,take),active:active?.courseId??null,total,more:items.length>take,ready:true,error:''}));}
    } catch(e){if(request===generation.current)setState(old=>({...old,owner,error:courseErrorMessage(e)}));}
    finally{if(request===generation.current){loading.current=false;setBusy(false);}}
  },[owner]);
  useFocusEffect(useCallback(()=>{
    let focused=true;loading.current=false;
    if(Platform.OS!=='web'){
      void fetchPage(0);
      // Existing offline records render immediately while pending saves reconcile.
      void getStorage().then(db=>db.courses.recover()).then(changed=>{if(focused&&changed)void fetchPage(0);}).catch(()=>undefined);
    }
    return()=>{focused=false;generation.current++;loading.current=false;};
  },[fetchPage]));
  return <View style={{flex:1,backgroundColor:c.background}}><ScrollView testID="saved-courses-scroll" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void fetchPage(0).finally(()=>setRefreshing(false));}}/>} scrollEventThrottle={200} onScroll={({nativeEvent:e})=>{if(current&&state.more&&!busy&&e.contentOffset.y+e.layoutMeasurement.height>=e.contentSize.height-240)void fetchPage(state.rows.length);}} contentContainerStyle={{padding:24,gap:16,paddingBottom:embedded?24:40}}>
    <UsagePanel/>
    {busy&&<ActivityIndicator color={c.action}/>}
    {current&&!!state.error&&<><AppText accessibilityRole="alert" testID="courses-error">{state.error}</AppText><Button compact variant="outline" label="다시 불러오기" disabled={busy} onPress={()=>void fetchPage(0)}/></>}
    {Platform.OS==='web'&&<AppText>저장한 코스는 Android 앱에서 확인해 주세요.</AppText>}
    {current&&state.ready&&!state.rows.length&&<AppText testID="courses-empty">아직 저장한 코스가 없어요. 계산 결과에서 원하는 후보를 저장해 보세요.</AppText>}
    {current&&state.rows.map(course=><CourseRow key={`${owner}:${course.id}`} course={course} selected={selection?.owner===owner?selection.id===course.id:state.active===course.id} onSelect={()=>setSelection({owner:owner!,id:course.id})}/>)}
    {current&&state.ready&&!state.rows.length&&<Button label="새 코스 만들기" onPress={()=>router.navigate("/route-lab")}/>}
  </ScrollView></View>;
}
