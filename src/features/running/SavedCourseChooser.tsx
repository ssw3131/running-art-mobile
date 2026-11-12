import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { getStorage } from '@/modules/storage/database';
import type { CourseSummary } from '@/modules/courses/model';
import { courseErrorMessage } from '@/modules/courses/model';
import { useSavedCoursePresentation, SavedCourseThumbnail } from '@/features/courses/SavedCoursePresentation';
import { estimatedRunningMinutes } from '@/features/course-generation/recommendation-metrics';
import { courseDuration } from '@/features/courses/CourseInformation';
import { useThemeColors } from '@/theme/ThemeProvider';
import { useAuth } from '@/features/auth/use-auth';
import { openServiceTab } from '@/features/service/open-service-tab';

function SavedCourseItem({course,selected,onSelect}:{course:CourseSummary;selected:boolean;onSelect():void}){
  const c=useThemeColors();
  const preview=useSavedCoursePresentation(course.id);
  const statusLabel=course.inProgress?'진행중':'미완주';
  return <View style={{minHeight:100,padding:9,borderRadius:20,borderWidth:1,borderColor:selected?c.selected:'transparent',backgroundColor:c.surface,boxShadow:'0px 0px 10px rgba(0,0,0,0.12)',flexDirection:'row',alignItems:'center'}}><Pressable testID={`run-saved-course-${course.id}`} accessibilityRole="button" accessibilityLabel={`${course.name}, ${course.lengthKm.toFixed(2)}킬로미터${course.unfinished?`, ${statusLabel}`:''}`} accessibilityState={{selected}} onPress={onSelect} style={{flex:1,flexDirection:'row',alignItems:'center',gap:20}}>
    <SavedCourseThumbnail snapshot={preview.snapshot} failed={preview.failed}/>
    <View style={{flex:1,gap:3}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:5}}><AppText weight="bold" numberOfLines={1} style={{flexShrink:1,fontSize:16,lineHeight:20}}>{course.name}</AppText>{course.unfinished&&<AppText testID={`run-in-progress-${course.id}`} weight="bold" style={{fontSize:10,color:'#FFFFFF',backgroundColor:'#FC5602',paddingHorizontal:6,borderRadius:20}}>{statusLabel}</AppText>}</View>
      <View style={{gap:1}}><AppText family="roboto" weight="bold" style={{fontSize:14,lineHeight:18}}>{course.lengthKm.toFixed(2)} km</AppText><AppText family="roboto" style={{fontSize:14,lineHeight:18}}>{courseDuration(estimatedRunningMinutes(course.lengthKm)??0)}</AppText></View>
      <AppText numberOfLines={1} style={{fontSize:13,lineHeight:17,color:c.muted}}>{preview.failed?'주소를 확인하지 못했어요.':preview.address}</AppText>
    </View></Pressable><Pressable testID={`run-course-detail-${course.id}`} accessibilityRole="button" accessibilityLabel={`${course.name} 상세 보기`} onPress={()=>router.push({pathname:'/courses/[id]',params:{id:course.id}})} style={{width:40,minHeight:80,alignItems:'center',justifyContent:'center'}}><Icon name="chevronRight" color="#D9D9D9"/></Pressable>
  </View>;
}
export default function SavedCourseChooser({busy:starting}:{busy:boolean}){
  const c=useThemeColors();
  const auth=useAuth(),owner=auth.account?.id,epoch=useRef(0),loading=useRef(false);
  const [selected,setSelected]=useState<string|null>(null);
  const [courses,setCourses]=useState<CourseSummary[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(true),[more,setMore]=useState(false);
  const load=useCallback(async(offset=0)=>{if(loading.current&&offset)return;loading.current=true;const ticket=++epoch.current;setBusy(true);setError('');try{const rows=await(await getStorage()).courses.list(30,offset);if(ticket===epoch.current){setCourses(old=>offset?[...old,...rows]:rows);if(!offset)setSelected(old=>rows.some(r=>r.id===old)?old:null);setMore(rows.length===30);}}catch(cause){if(ticket===epoch.current)setError(courseErrorMessage(cause));}finally{if(ticket===epoch.current){loading.current=false;setBusy(false);}}},[]);
  useFocusEffect(useCallback(()=>{epoch.current++;if(!owner)setError('');setCourses([]);void load();return()=>{epoch.current++;};},[owner,load]));
  return <View style={{flex:1,backgroundColor:c.background}}>
    <FlatList data={courses} keyExtractor={item=>item.id} renderItem={({item})=><SavedCourseItem course={item} selected={selected===item.id} onSelect={()=>setSelected(item.id)}/>} initialNumToRender={5} windowSize={5} contentContainerStyle={{padding:32,gap:20,paddingBottom:24}}
      ListHeaderComponent={<View style={{gap:6,marginBottom:8,alignItems:'center'}}><AppText weight="bold" style={{fontSize:24,textAlign:'center'}}>어떤 코스를 달려볼까요?</AppText><AppText variant="caption" style={{color:c.muted,textAlign:'center',fontSize:12}}>저장한 코스 중 하나를 선택해 러닝을 시작하세요.</AppText></View>}
      ListEmptyComponent={!busy&&!error?<AppText>저장된 코스가 없어요. 코스를 만들어 보관함에 저장해 주세요.</AppText>:null}
      ListFooterComponent={<View style={{gap:20,paddingTop:8}}>{busy&&<ActivityIndicator/>}{!!error&&<><AppText accessibilityRole="alert">{error}</AppText><Button label="다시 불러오기" onPress={()=>void load()}/></>}{more&&<Button variant="outline" label="더 보기" disabled={busy} onPress={()=>void load(courses.length)}/>}<Button label="새로운 코스 생성하기" variant="outline" labelStyle={{color:c.muted,fontSize:16}} onPress={()=>openServiceTab('/route-lab')}/></View>}/>
    <View style={{paddingHorizontal:26,paddingTop:12,paddingBottom:30,gap:20}}><Button testID="run-selected-start" label="실시간 러닝 시작하기" disabled={starting||!selected} leading={<Image source={require('../../../assets/generation/run.svg')} tintColor="#FFFFFF" style={{width:22,height:22}}/>} onPress={()=>{if(selected)router.setParams({courseId:selected});}}/></View>
  </View>;
}
