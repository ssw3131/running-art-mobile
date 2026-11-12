import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, Pressable, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { runErrorMessage } from '@/modules/running/model';
import type { FinishedRun } from '@/modules/running/repository';
import { RegionText } from '@/features/achievements/RegionText';
import { estimatedRunningMinutes } from '@/features/course-generation/recommendation-metrics';
import { courseDuration } from '@/features/courses/CourseInformation';
import { recordDate } from '@/features/achievements/BadgeRunCard';
import { groupRunsByMonth } from '@/modules/running/archive';
import { GenerationIcon, LegacyShapeIcon } from '@/features/course-generation/GenerationIcon';
import { SERVICE_SHAPES } from '@/modules/route-engine/service-shapes';
import { openServiceTab } from '@/features/service/open-service-tab';
import { useThemeColors } from '@/theme/ThemeProvider';

export default function RunsScreen({embedded=false}:{embedded?:boolean}) {
  const c=useThemeColors(),auth=useAuth(),owner=auth.ready?auth.account?.id??'':null;
  const [state,setState]=useState<{owner:string|null;rows:FinishedRun[];error:string;ready:boolean;more:boolean}>({owner:null,rows:[],error:'',ready:false,more:false});
  const [refreshing,setRefreshing]=useState(false);
  const [busy,setBusy]=useState(false);const generation=useRef(0),loading=useRef(false),loaded=useRef(30);
  const current=owner!==null&&state.owner===owner;
  const fetchPage=useCallback(async(offset:number)=>{
    if(loading.current||owner===null)return;const request=++generation.current;loading.current=true;setBusy(true);
    if(!offset)setState(old=>old.owner===owner?{...old,error:''}:{owner,rows:[],error:'',ready:false,more:false});
    try{const db=await getStorage(),take=offset?30:loaded.current,items:FinishedRun[]=[];
      for(let start=0;start<take+1;start+=100)items.push(...await db.runs.finished(Math.min(100,take+1-start),offset+start));
      if(request===generation.current){loaded.current=offset+Math.min(items.length,take);setState(old=>({owner,rows:offset?[...old.rows,...items.slice(0,take)]:items.slice(0,take),error:'',ready:true,more:items.length>take}));}}
    catch(e){if(request===generation.current)setState(old=>({...old,owner,error:runErrorMessage(e)}));}
    finally{if(request===generation.current){loading.current=false;setBusy(false);}}
  },[owner]);
  useFocusEffect(useCallback(()=>{loading.current=false;if(Platform.OS==='android')void fetchPage(0);return()=>{generation.current++;loading.current=false;};},[fetchPage]));
  return <View style={{flex:1,backgroundColor:c.background}}><ScrollView testID="finished-runs-scroll" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void fetchPage(0).finally(()=>setRefreshing(false));}}/>} scrollEventThrottle={200} onScroll={({nativeEvent:e})=>{if(current&&state.more&&!busy&&e.contentOffset.y+e.layoutMeasurement.height>=e.contentSize.height-240)void fetchPage(state.rows.length);}} contentContainerStyle={{padding:24,gap:16,paddingBottom:embedded?24:40}}>
    {busy&&<ActivityIndicator color={c.action}/>}
    {current&&!!state.error&&<><AppText accessibilityRole="alert">{state.error}</AppText><Button compact variant="outline" label="다시 불러오기" disabled={busy} onPress={()=>void fetchPage(0)}/></>}
    {current&&state.ready&&!state.rows.length&&<AppText testID="runs-empty">아직 완주 기록이 없어요. 저장한 코스를 한 바퀴 완주해 보세요.</AppText>}
    {Platform.OS!=='android'&&<AppText>Android 앱에서 확인해 주세요.</AppText>}
    {current&&groupRunsByMonth(state.rows).map(group=><View key={group.key} testID={`run-month-${group.key}`} style={{gap:14}}>
      <AppText variant="heading" weight="bold">{group.label}</AppText>
      {group.runs.map(run=>{const record=state.rows.find(row=>row.id===run.id),shapeId=record?.shape,shape=SERVICE_SHAPES.find(s=>s.id===shapeId);return <View key={run.id} style={{flexDirection:'row',gap:10,alignItems:'center'}}>
        <View style={{width:40,alignItems:'center'}}><AppText weight="bold" variant="heading">{new Date(run.endedAt??run.startedAt).getDate()}</AppText><AppText variant="caption">{new Date(run.endedAt??run.startedAt).toLocaleDateString('ko-KR',{weekday:'short'})}</AppText></View>
        <View style={{width:1,alignSelf:'stretch',backgroundColor:c.divider,justifyContent:'center'}}><View style={{width:7,height:7,borderRadius:4,backgroundColor:c.action,marginLeft:-3}}/></View>
        <Link href={{pathname:'/runs/[id]',params:{id:run.id}}} asChild><Pressable accessibilityRole="button" testID={`run-row-${run.id}`} style={{flex:1,minHeight:100,padding:10,borderRadius:20,backgroundColor:c.surface,boxShadow:'0px 0px 5px rgba(0,0,0,0.15)',flexDirection:'row',alignItems:'center',gap:10}}>
          <View style={{width:64,height:64,borderRadius:32,borderWidth:1,borderColor:c.divider,alignItems:'center',justifyContent:'center'}}>{shape?<GenerationIcon name={shape.id} color="#FC5602"/>:shapeId==='custom'?<GenerationIcon name="draw" color="#FC5602"/>:shapeId?<LegacyShapeIcon shape={shapeId} color="#FC5602"/>:<Icon name="run"/>}</View>
          <View style={{flex:1,gap:4}}><AppText weight="bold" numberOfLines={2}>{run.courseName??'코스'}</AppText>
            <AppText variant="caption" accessibilityLabel="거리와 예상 러닝 시간">{(run.distanceM/1000).toFixed(1)}{'\u00a0'}km  |  {courseDuration(estimatedRunningMinutes(run.distanceM/1000)??0)}</AppText><RegionText lat={record?.originLat} lng={record?.originLng}/><AppText variant="caption">{recordDate(run.endedAt??run.startedAt)}</AppText></View><Image source={require('../../../assets/ui/chevron-right.svg')} tintColor={c.outline} style={{width:16,height:24,flexShrink:0}} contentFit="contain" accessible={false}/>
        </Pressable></Link>
      </View>;})}
    </View>)}
    {current&&state.ready&&!state.rows.length&&<Button label="저장 코스 보기" onPress={()=>openServiceTab({pathname:'/courses',params:{view:'courses'}})}/>}
  </ScrollView></View>;
}
