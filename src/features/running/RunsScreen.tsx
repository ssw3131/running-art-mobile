import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Pressable, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { durationLabel, runErrorMessage, type Run } from '@/modules/running/model';
import { groupRunsByMonth } from '@/modules/running/archive';
import { GenerationIcon, LegacyShapeIcon } from '@/features/course-generation/GenerationIcon';
import { SERVICE_SHAPES } from '@/modules/route-engine/service-shapes';
import { openServiceTab } from '@/features/service/open-service-tab';
import { useThemeColors } from '@/theme/ThemeProvider';

export default function RunsScreen({embedded=false}:{embedded?:boolean}) {
  const c=useThemeColors(),auth=useAuth(),owner=auth.ready?auth.account?.id??'':null;
  const [state,setState]=useState<{owner:string|null;rows:(Run&{shape:string|null})[];error:string;ready:boolean;more:boolean}>({owner:null,rows:[],error:'',ready:false,more:false});
  const [busy,setBusy]=useState(false);const generation=useRef(0),loading=useRef(false),loaded=useRef(30);
  const current=owner!==null&&state.owner===owner;
  const fetchPage=useCallback(async(offset:number)=>{
    if(loading.current||owner===null)return;const request=++generation.current;loading.current=true;setBusy(true);
    if(!offset)setState(old=>old.owner===owner?{...old,error:''}:{owner,rows:[],error:'',ready:false,more:false});
    try{const db=await getStorage(),take=offset?30:loaded.current,items:(Run&{shape:string|null})[]=[];
      for(let start=0;start<take+1;start+=100)items.push(...await db.runs.finished(Math.min(100,take+1-start),offset+start));
      if(request===generation.current){loaded.current=offset+Math.min(items.length,take);setState(old=>({owner,rows:offset?[...old.rows,...items.slice(0,take)]:items.slice(0,take),error:'',ready:true,more:items.length>take}));}}
    catch(e){if(request===generation.current)setState(old=>({...old,owner,error:runErrorMessage(e)}));}
    finally{if(request===generation.current){loading.current=false;setBusy(false);}}
  },[owner]);
  useFocusEffect(useCallback(()=>{loading.current=false;if(Platform.OS==='android')void fetchPage(0);return()=>{generation.current++;loading.current=false;};},[fetchPage]));
  return <View style={{flex:1,backgroundColor:c.background}}><ScrollView contentContainerStyle={{padding:24,gap:16,paddingBottom:embedded?24:40}}>
    {busy&&<ActivityIndicator color={c.action}/>}
    {current&&!!state.error&&<AppText accessibilityRole="alert">{state.error}</AppText>}
    {current&&state.ready&&!state.rows.length&&<AppText testID="runs-empty">아직 완주 기록이 없어요. 저장한 코스를 한 바퀴 완주해 보세요.</AppText>}
    {Platform.OS!=='android'&&<AppText>Android 앱에서 확인해 주세요.</AppText>}
    {current&&groupRunsByMonth(state.rows).map(group=><View key={group.key} testID={`run-month-${group.key}`} style={{gap:14}}>
      <AppText variant="heading" weight="bold">{group.label}</AppText>
      {group.runs.map(run=>{const shapeId=state.rows.find(row=>row.id===run.id)?.shape,shape=SERVICE_SHAPES.find(s=>s.id===shapeId);return <View key={run.id} style={{flexDirection:'row',gap:10,alignItems:'center'}}>
        <View style={{width:40,alignItems:'center'}}><AppText weight="bold" variant="heading">{new Date(run.startedAt).getDate()}</AppText><AppText variant="caption">{new Date(run.startedAt).toLocaleDateString('ko-KR',{weekday:'short'})}</AppText></View>
        <View style={{width:1,alignSelf:'stretch',backgroundColor:c.divider,justifyContent:'center'}}><View style={{width:7,height:7,borderRadius:4,backgroundColor:c.action,marginLeft:-3}}/></View>
        <Link href={{pathname:'/runs/[id]',params:{id:run.id}}} asChild><Pressable accessibilityRole="button" testID={`run-row-${run.id}`} style={{flex:1,minHeight:100,padding:10,borderRadius:20,backgroundColor:c.surface,boxShadow:'0px 0px 5px rgba(0,0,0,0.15)',flexDirection:'row',alignItems:'center',gap:10}}>
          <View style={{width:72,height:72,borderRadius:36,borderWidth:1,borderColor:c.divider,alignItems:'center',justifyContent:'center'}}>{shape?<GenerationIcon name={shape.id}/>:shapeId==='custom'?<GenerationIcon name="draw"/>:shapeId?<LegacyShapeIcon shape={shapeId}/>:<Icon name="run"/>}</View>
          <View style={{flex:1,gap:4}}><AppText weight="bold" numberOfLines={2}>{run.courseName??'코스'}</AppText>
            <AppText variant="label" weight="bold">{(run.distanceM/1000).toFixed(2)} km</AppText><AppText variant="label">{durationLabel(run.activeMs)}</AppText></View><Icon name="chevronRight" color={c.outline}/>
        </Pressable></Link>
      </View>;})}
    </View>)}
    {current&&state.more&&<Button variant="outline" label="더 보기" testID="runs-more" disabled={busy} onPress={()=>void fetchPage(state.rows.length)}/>}
    {current&&state.ready&&!state.rows.length&&<Button label="저장 코스 보기" onPress={()=>openServiceTab({pathname:'/courses',params:{view:'courses'}})}/>}
    <Button compact variant="outline" label="새로고침" testID="runs-refresh" disabled={busy} onPress={()=>void fetchPage(0)}/>
  </ScrollView></View>;
}
