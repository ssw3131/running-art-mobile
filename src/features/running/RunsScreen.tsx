import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Pressable, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { durationLabel, runErrorMessage, type Run } from '@/modules/running/model';
import { groupRunsByMonth, runOutcomeLabel } from '@/modules/running/archive';
import { openServiceTab } from '@/features/service/open-service-tab';
import { useThemeColors } from '@/theme/ThemeProvider';

export default function RunsScreen({embedded=false}:{embedded?:boolean}) {
  const c=useThemeColors(),auth=useAuth(),owner=auth.ready?auth.account?.id??'':null;
  const [state,setState]=useState<{owner:string|null;rows:Run[];error:string;ready:boolean;more:boolean}>({owner:null,rows:[],error:'',ready:false,more:false});
  const [busy,setBusy]=useState(false);const generation=useRef(0),loading=useRef(false);
  const current=owner!==null&&state.owner===owner;
  const fetchPage=useCallback(async(offset:number)=>{
    if(loading.current||owner===null)return;const request=++generation.current;loading.current=true;setBusy(true);
    if(!offset)setState({owner,rows:[],error:'',ready:false,more:false});
    try{const items=await(await getStorage()).runs.list(31,offset);if(request===generation.current)setState(old=>({owner,rows:offset?[...old.rows,...items.slice(0,30)]:items.slice(0,30),error:'',ready:true,more:items.length>30}));}
    catch(e){if(request===generation.current)setState(old=>({...old,owner,error:runErrorMessage(e)}));}
    finally{if(request===generation.current){loading.current=false;setBusy(false);}}
  },[owner]);
  useFocusEffect(useCallback(()=>{loading.current=false;if(Platform.OS==='android')void fetchPage(0);return()=>{generation.current++;loading.current=false;};},[fetchPage]));
  return <View style={{flex:1,backgroundColor:c.background}}><ScrollView contentContainerStyle={{padding:24,gap:16,paddingBottom:embedded?24:40}}>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12}}><AppText variant="heading" weight="bold">러닝 기록</AppText><Button compact variant="outline" label="새로고침" testID="runs-refresh" disabled={busy} onPress={()=>void fetchPage(0)}/></View>
    <AppText variant="caption" style={{color:c.muted}}>완주·중도 종료·자유 러닝을 모두 보관해요. 종료한 러닝의 재도전은 새 기록으로 시작해요.</AppText>
    {busy&&<ActivityIndicator color={c.action}/>}
    {current&&!!state.error&&<AppText accessibilityRole="alert">{state.error}</AppText>}
    {current&&state.ready&&!state.rows.length&&<AppText testID="runs-empty">아직 러닝 기록이 없어요.</AppText>}
    {Platform.OS!=='android'&&<AppText>Android 앱에서 확인해 주세요.</AppText>}
    {current&&groupRunsByMonth(state.rows).map(group=><View key={group.key} testID={`run-month-${group.key}`} style={{gap:14}}>
      <AppText variant="heading" weight="bold">{group.label}</AppText>
      {group.runs.map(run=><View key={run.id} style={{flexDirection:'row',gap:10,alignItems:'center'}}>
        <View style={{width:40,alignItems:'center'}}><AppText weight="bold" variant="heading">{new Date(run.startedAt).getDate()}</AppText><AppText variant="caption">{new Date(run.startedAt).toLocaleDateString('ko-KR',{weekday:'short'})}</AppText></View>
        <Link href={{pathname:'/runs/[id]',params:{id:run.id}}} asChild><Pressable accessibilityRole="button" testID={`run-row-${run.id}`} style={{flex:1,minHeight:100,padding:14,borderRadius:20,backgroundColor:c.surface,boxShadow:'0px 0px 5px rgba(0,0,0,0.15)',flexDirection:'row',alignItems:'center',gap:10}}>
          <View style={{flex:1,gap:4}}><AppText weight="bold" numberOfLines={2}>{run.courseName??'자유 러닝'}</AppText><AppText variant="caption" style={{color:run.courseOutcome==='finished'?c.selected:c.muted}}>{runOutcomeLabel(run)}</AppText>
            <AppText variant="label" weight="bold">{(run.distanceM/1000).toFixed(2)} km</AppText><AppText variant="label">{durationLabel(run.activeMs)}</AppText></View><Icon name="chevronRight"/>
        </Pressable></Link>
      </View>)}
    </View>)}
    {current&&state.more&&<Button variant="outline" label="더 보기" testID="runs-more" disabled={busy} onPress={()=>void fetchPage(state.rows.length)}/>}
    <Button label="러닝 시작·계속하기" onPress={()=>openServiceTab("/run")}/>
  </ScrollView></View>;
}
