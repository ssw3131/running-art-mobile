import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { getStorage } from '@/modules/storage/database';
import type { CourseSummary } from '@/modules/courses/model';
import { courseErrorMessage, courseShapes } from '@/modules/courses/model';
import { GenerationIcon, LegacyShapeIcon } from '@/features/course-generation/GenerationIcon';
import { useAuth } from '@/features/auth/use-auth';
import { openServiceTab } from '@/features/service/open-service-tab';

const shapeIcons=['heart','star','cloud','crown','icecream','strawberry','fish','bone','whale','turtle','cat','dog'] as const;
export default function SavedCourseChooser({onFreeStart,busy:starting}:{onFreeStart():void;busy:boolean}){
  const auth=useAuth(),owner=auth.account?.id,epoch=useRef(0),loading=useRef(false);
  const [courses,setCourses]=useState<CourseSummary[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(true),[more,setMore]=useState(false);
  const load=useCallback(async(offset=0)=>{if(loading.current)return;loading.current=true;const ticket=epoch.current;setBusy(true);setError('');try{const rows=await(await getStorage()).courses.list(30,offset);if(ticket===epoch.current){setCourses(old=>offset?[...old,...rows]:rows);setMore(rows.length===30);}}catch(cause){if(ticket===epoch.current)setError(courseErrorMessage(cause));}finally{loading.current=false;if(ticket===epoch.current)setBusy(false);}},[]);
  useFocusEffect(useCallback(()=>{epoch.current++;if(!owner)setError('');setCourses([]);void load();return()=>{epoch.current++;};},[owner,load]));
  return <View style={{flex:1,backgroundColor:'#FFFFFF'}}><ScrollView contentContainerStyle={{padding:32,gap:20,paddingBottom:24}}>
    <View style={{gap:8,marginBottom:8}}><AppText weight="bold" style={{fontSize:24}}>달릴 코스를 선택해 주세요</AppText><AppText variant="caption" style={{color:'#666666'}}>보관함에 저장한 코스로 실시간 러닝을 시작해요.</AppText></View>
    {courses.map(course=><Pressable key={course.id} testID={`run-saved-course-${course.id}`} accessibilityRole="button" accessibilityLabel={`${course.name}, ${course.lengthKm.toFixed(2)}킬로미터${course.unfinished?', 진행중':''}`} onPress={()=>router.setParams({courseId:course.id})} style={{minHeight:100,padding:10,borderRadius:20,backgroundColor:'#FFFFFF',boxShadow:'0px 0px 10px rgba(0,0,0,0.12)',flexDirection:'row',alignItems:'center',gap:12}}>
      <View style={{width:80,height:80,borderRadius:12,backgroundColor:course.unfinished?'#FFF0E8':'#F4F4F4',alignItems:'center',justifyContent:'center'}}>{shapeIcons.find(s=>s===course.shape)?<GenerationIcon name={shapeIcons.find(s=>s===course.shape)!}/>:<LegacyShapeIcon shape={course.shape}/>}</View>
      <View style={{flex:1,gap:5}}><AppText weight="bold">{course.name}</AppText><AppText weight="bold" variant="label">{course.lengthKm.toFixed(2)} km</AppText><AppText variant="caption" style={{color:'#666666'}}>{courseShapes[course.shape]}</AppText>{course.unfinished&&<AppText testID={`run-in-progress-${course.id}`} weight="bold" style={{fontSize:10,color:'#FC5602'}}>진행중</AppText>}</View><Icon name="chevronRight"/>
    </Pressable>)}
    {busy&&<ActivityIndicator/>}{!!error&&<><AppText accessibilityRole="alert">{error}</AppText><Button label="다시 불러오기" onPress={()=>void load()}/></>}
    {!busy&&!courses.length&&!error&&<AppText>저장된 코스가 없어요. 코스를 만들어 보관함에 저장해 주세요.</AppText>}
    {more&&<Button variant="outline" label="더 보기" disabled={busy} onPress={()=>void load(courses.length)}/>}
  </ScrollView><View style={{padding:26,gap:8}}><Button testID="run-start" variant="outline" label="자유 러닝 시작" disabled={starting} onPress={onFreeStart}/><Button label="새로운 코스 만들기" onPress={()=>openServiceTab('/courses')}/><AppText variant="caption" style={{color:'#666666',textAlign:'center'}}>코스를 만들고 저장한 후 러닝을 시작해 주세요.</AppText></View></View>;
}
