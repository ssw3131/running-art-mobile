import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { GenerationIcon, LegacyShapeIcon } from '@/features/course-generation/GenerationIcon';
import { SERVICE_SHAPES } from '@/modules/route-engine/service-shapes';
import { getStorage } from '@/modules/storage/database';
import { courseErrorMessage, courseShapes, type CourseSummary } from '@/modules/courses/model';
import { useThemeColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

const PAGE=30;
export default function CoursesScreen({embedded=false}:{embedded?:boolean}) {
  const c=useThemeColors(),auth=useAuth(),owner=auth.ready ? auth.account?.id??'' : null;
  const [state,setState]=useState<{owner:string|null;rows:CourseSummary[];active:string|null;total:number;more:boolean;ready:boolean;error:string}>({owner:null,rows:[],active:null,total:0,more:false,ready:false,error:''});
  const [busy,setBusy]=useState(false), generation=useRef(0),loading=useRef(false);
  const current=owner!==null && state.owner===owner;
  const fetchPage=useCallback(async(offset:number)=>{
    if(loading.current || owner===null)return;
    const request=++generation.current;loading.current=true;setBusy(true);
    if(!offset)setState({owner,rows:[],active:null,total:0,more:false,ready:false,error:''});
    try {
      const db=await getStorage();const items=await db.courses.list(PAGE+1,offset),active=await db.runs.active(),total=await db.courses.count();
      if(request===generation.current)setState(old=>({owner,rows:offset?[...old.rows,...items.slice(0,PAGE)]:items.slice(0,PAGE),active:active?.courseId??null,total,more:items.length>PAGE,ready:true,error:''}));
    } catch(e){if(request===generation.current)setState(old=>({...old,owner,error:courseErrorMessage(e)}));}
    finally{if(request===generation.current){loading.current=false;setBusy(false);}}
  },[owner]);
  useFocusEffect(useCallback(()=>{loading.current=false;if(Platform.OS!=='web')void fetchPage(0);return()=>{generation.current++;loading.current=false;};},[fetchPage]));
  return <View style={{flex:1,backgroundColor:c.background}}><ScrollView contentContainerStyle={{padding:24,gap:16,paddingBottom:embedded?24:40}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}><View><AppText variant="heading" weight="bold">저장한 코스</AppText>{current&&state.ready&&<AppText variant="caption">{state.total}개</AppText>}</View>
      <Button compact variant="outline" testID="courses-refresh" label="새로고침" disabled={busy} onPress={()=>void fetchPage(0)}/></View>
    <AppText variant="caption" style={{color:c.muted}}>코스를 골라 러닝을 시작해 보세요. 저장한 코스와 러닝 기록은 각각 관리돼요.</AppText>
    {busy&&<ActivityIndicator color={c.action}/>}
    {current&&!!state.error&&<AppText accessibilityRole="alert" testID="courses-error">{state.error}</AppText>}
    {Platform.OS==='web'&&<AppText>저장한 코스는 Android 앱에서 확인해 주세요.</AppText>}
    {current&&state.ready&&!state.rows.length&&<AppText testID="courses-empty">아직 저장한 코스가 없어요. 계산 결과에서 원하는 후보를 저장해 보세요.</AppText>}
    {current&&state.rows.map(course=>{
      const shape=SERVICE_SHAPES.find(s=>s.id===course.shape),active=state.active===course.id;
      return <Link key={course.id} href={{pathname:'/courses/[id]',params:{id:course.id}}} asChild>
        <Pressable testID={`course-row-${course.id}`} accessibilityRole="button" style={{minHeight:100,padding:10,borderRadius:radius.card,backgroundColor:c.surface,borderWidth:active?1:0,borderColor:c.selected,boxShadow:'0px 0px 5px rgba(0,0,0,0.15)',flexDirection:'row',alignItems:'center',gap:16}}>
          <View style={{width:72,height:80,borderRadius:10,backgroundColor:active?'#FFEEE5':c.navigation,alignItems:'center',justifyContent:'center'}}>
            {shape?<GenerationIcon name={shape.id}/>:course.shape==='custom'?<AppText variant="caption">사용자 도형</AppText>:<LegacyShapeIcon shape={course.shape}/>}
          </View>
          <View style={{flex:1,gap:4}}><AppText weight="bold" numberOfLines={2}>{course.name}</AppText>
            {active&&<AppText variant="caption" weight="bold" style={{color:c.selected}}>진행 중</AppText>}
            <AppText variant="label" weight="bold">{course.lengthKm.toFixed(2)} km</AppText>
            <AppText variant="caption" style={{color:c.muted}}>{courseShapes[course.shape]} · {course.source==='synthetic'?'가상 테스트 코스':new Date(course.createdAt).toLocaleDateString('ko-KR')}</AppText></View>
          <Icon name="chevronRight"/>
        </Pressable></Link>;
    })}
    {current&&state.more&&<Button compact variant="outline" label="더 보기" disabled={busy} onPress={()=>void fetchPage(state.rows.length)}/>}
    <Button label="새 코스 만들기" onPress={()=>router.navigate("/route-lab")}/>
  </ScrollView></View>;
}
