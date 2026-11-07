import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { getStorage } from '@/modules/storage/database';
import type { CourseSummary } from '@/modules/courses/model';
import { courseErrorMessage } from '@/modules/courses/model';
import type { Origin } from '@/modules/route-engine/types';
import { GenerationIcon, LegacyShapeIcon } from '@/features/course-generation/GenerationIcon';
import { usePointAddress } from '@/features/course-generation/use-point-address';
import { estimatedRunningMinutes } from '@/features/course-generation/recommendation-metrics';
import { courseDuration } from '@/features/courses/CourseInformation';
import { useThemeColors } from '@/theme/ThemeProvider';
import { useAuth } from '@/features/auth/use-auth';
import { openServiceTab } from '@/features/service/open-service-tab';

const shapeIcons=['heart','star','cloud','crown','icecream','strawberry','fish','bone','whale','turtle','cat','dog'] as const;
function SavedCourseItem({course}:{course:CourseSummary}){
  const c=useThemeColors();
  const [origin,setOrigin]=useState<Origin>(),[failed,setFailed]=useState(false);
  useFocusEffect(useCallback(()=>{let current=true;void(async()=>{try{const saved=await(await getStorage()).courses.get(course.id);if(current)setOrigin(saved.snapshot.origin);}catch{if(current)setFailed(true);}})();return()=>{current=false;};},[course.id]));
  const address=usePointAddress(origin),shape=shapeIcons.find(s=>s===course.shape);
  return <Pressable testID={`run-saved-course-${course.id}`} accessibilityRole="button" accessibilityLabel={`${course.name}, ${course.lengthKm.toFixed(2)}킬로미터${course.unfinished?', 진행중':''}`} onPress={()=>router.setParams({courseId:course.id})} style={{minHeight:100,padding:10,borderRadius:20,backgroundColor:c.surface,boxShadow:'0px 0px 10px rgba(0,0,0,0.12)',flexDirection:'row',alignItems:'center',gap:12}}>
    <View style={{width:80,height:80,borderRadius:12,backgroundColor:course.unfinished?'#FFF0E8':c.navigation,alignItems:'center',justifyContent:'center'}}>{shape?<GenerationIcon name={shape} color={course.unfinished?'#FC5602':'#B3B3B3'}/>:<LegacyShapeIcon shape={course.shape}/>}</View>
    <View style={{flex:1,gap:5}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:5}}><AppText weight="bold" numberOfLines={1} style={{flexShrink:1,fontSize:16}}>{course.name}</AppText>{course.unfinished&&<AppText testID={`run-in-progress-${course.id}`} weight="bold" style={{fontSize:10,color:'#FC5602',backgroundColor:'#FFF0E8',paddingHorizontal:4,borderRadius:3}}>진행중</AppText>}</View>
      <View style={{flexDirection:'row',gap:10,flexWrap:'wrap'}}><AppText family="roboto" weight="bold" style={{fontSize:14}}>{course.lengthKm.toFixed(2)} km</AppText><AppText family="roboto" style={{fontSize:14}}>{courseDuration(estimatedRunningMinutes(course.lengthKm)??0)}</AppText></View>
      <AppText numberOfLines={1} style={{fontSize:13,color:c.muted}}>{failed?'주소를 확인하지 못했어요.':address.label}</AppText>
    </View><Icon name="chevronRight"/>
  </Pressable>;
}
export default function SavedCourseChooser({onFreeStart,busy:starting}:{onFreeStart():void;busy:boolean}){
  const c=useThemeColors();
  const auth=useAuth(),owner=auth.account?.id,epoch=useRef(0),loading=useRef(false);
  const [courses,setCourses]=useState<CourseSummary[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(true),[more,setMore]=useState(false);
  const load=useCallback(async(offset=0)=>{if(loading.current)return;loading.current=true;const ticket=epoch.current;setBusy(true);setError('');try{const rows=await(await getStorage()).courses.list(30,offset);if(ticket===epoch.current){setCourses(old=>offset?[...old,...rows]:rows);setMore(rows.length===30);}}catch(cause){if(ticket===epoch.current)setError(courseErrorMessage(cause));}finally{loading.current=false;if(ticket===epoch.current)setBusy(false);}},[]);
  useFocusEffect(useCallback(()=>{epoch.current++;if(!owner)setError('');setCourses([]);void load();return()=>{epoch.current++;};},[owner,load]));
  return <View style={{flex:1,backgroundColor:c.background}}>
    <FlatList data={courses} keyExtractor={item=>item.id} renderItem={({item})=><SavedCourseItem course={item}/>} initialNumToRender={5} windowSize={5} contentContainerStyle={{padding:32,gap:20,paddingBottom:24}}
      ListHeaderComponent={<View style={{gap:8,marginBottom:8}}><AppText weight="bold" style={{fontSize:24}}>어떤 코스를 달려볼까요?</AppText><AppText variant="caption" style={{color:c.muted}}>저장한 코스 중 하나를 선택해 러닝을 시작하세요.</AppText></View>}
      ListEmptyComponent={!busy&&!error?<AppText>저장된 코스가 없어요. 코스를 만들어 보관함에 저장해 주세요.</AppText>:null}
      ListFooterComponent={<View style={{gap:12}}>{busy&&<ActivityIndicator/>}{!!error&&<><AppText accessibilityRole="alert">{error}</AppText><Button label="다시 불러오기" onPress={()=>void load()}/></>}{more&&<Button variant="outline" label="더 보기" disabled={busy} onPress={()=>void load(courses.length)}/>}</View>}/>
    <View style={{padding:26,gap:8}}><Button label="코스 생성하기" leading={<GenerationIcon name="generate"/>} onPress={()=>openServiceTab('/route-lab')}/><AppText variant="caption" style={{color:c.muted,textAlign:'center'}}>원하는 코스가 없으면 코스를 생성해보세요.</AppText><Button testID="run-start" compact variant="outline" label="자유 러닝 시작" disabled={starting} onPress={onFreeStart}/></View>
  </View>;
}
