import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { AppText, Button, Toggle } from '@/components/ui';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { useAuth } from '@/features/auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { authentication } from '@/modules/auth/runtime';
import { CourseError, COURSE_NAME_MAX, courseErrorMessage, courseShapes, encodeSnapshot, savedCourseOverlay, type CourseAttempt, type CourseSnapshot } from '@/modules/courses/model';
import { courseContinuation } from '@/modules/courses/continuation';
import { shareCourseGpx } from '@/modules/courses/share-gpx';
import { exportErrorMessage } from '@/modules/courses/export';
import { candidateDrafts, centerLabel } from '@/features/course-generation/model';
import { estimatedRunningMinutes, paceExplanation } from '@/features/course-generation/recommendation-metrics';
import { DifficultyTag } from '@/features/course-generation/DifficultyTag';
import { GenerationIcon } from '@/features/course-generation/GenerationIcon';
import { MapCredits } from '@/features/course-generation/MapCredits';
import TerrainPanel from '@/features/terrain/TerrainPanel';
import { useTerrain } from '@/features/terrain/use-terrain';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import { openServiceTab } from '@/features/service/open-service-tab';
import { serviceTabs } from '@/features/service/navigation';
import { useThemeColors } from '@/theme/ThemeProvider';

type Detail={owner:string;routeKey:string;name:string;snapshot:CourseSnapshot;savedId:string|null;last:CourseAttempt|null;activeId:string|null};
const styleUrl=mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY),emptyRoads={type:'FeatureCollection' as const,features:[]};
export default function CourseDetailScreen() {
  const params=useLocalSearchParams<{id?:string;runId?:string;draft?:string}>(),auth=useAuth(),owner=auth.account?.id??'';
  const c=useThemeColors(),insets=useSafeAreaInsets(),{width}=useWindowDimensions();
  const [data,setData]=useState<Detail|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [editing,setEditing]=useState(false),[name,setName]=useState(''),[expanded,setExpanded]=useState(false);
  const [showTarget,setShowTarget]=useState(true),[background,setBackground]=useState(true);
  const revision=useRef(0),working=useRef(false),exporting=useRef<AbortController|null>(null);
  const draft=useMemo(()=>candidateDrafts.get(params.draft,owner||'guest'),[params.draft,owner]);
  const routeKey=JSON.stringify([params.id,params.runId,params.draft]);
  const current=data?.owner===owner&&data.routeKey===routeKey?data:null;
  const terrain=useTerrain(current?.snapshot.source==='osm'?current.snapshot.route:undefined,true);
  const overlay=useMemo(()=>current?savedCourseOverlay(current.snapshot):null,[current]);
  const refresh=useCallback(async()=>{
    const ticket=++revision.current;setError('');
    try {
      const db=await getStorage(); let snapshot:CourseSnapshot,nameValue:string,savedId:string|null=null;
      if(draft){snapshot=draft.snapshot;nameValue=draft.name??`${courseShapes[snapshot.shape]} 코스`;savedId=await db.courses.findHash(encodeSnapshot(snapshot).hash);if(savedId)nameValue=(await db.courses.get(savedId)).name;}
      else if(params.id){
        try{const saved=await db.courses.get(params.id);snapshot=saved.snapshot;nameValue=saved.name;savedId=saved.id;}
        catch(cause){
          if(!(cause instanceof CourseError)||cause.code!=='missing'||!params.runId)throw cause;
          const guide=await db.runs.guidance(params.runId);if(!guide)throw cause;
          snapshot=guide.course.snapshot;nameValue=guide.course.name;savedId=await db.courses.findHash(encodeSnapshot(snapshot).hash);
        }
      }else throw new Error('후보를 다시 선택해 주세요.');
      const last=await db.courses.latestAttempt(savedId??params.id??null,encodeSnapshot(snapshot).hash),active=await db.runs.active();
      if(ticket===revision.current&&(authentication.getSnapshot().account?.id??'')===owner){setData({owner,routeKey,name:nameValue,snapshot,savedId,last,activeId:active?.id??null});setName(nameValue);}
    }catch(cause){if(ticket===revision.current)setError(cause instanceof Error?cause.message:'코스를 확인하지 못했어요.');}
  },[draft,owner,params.id,params.runId,routeKey]);
  useFocusEffect(useCallback(()=>{void refresh();return()=>{revision.current++;exporting.current?.abort();};},[refresh]));
  async function mutate(task:(check:()=>void)=>Promise<void>) {
    if(working.current||!current)return;working.current=true;setBusy(true);setError('');setNotice('');
    const ticket=revision.current,captured=owner;
    const check=()=>{if(ticket!==revision.current||(authentication.getSnapshot().account?.id??'')!==captured)throw new Error('계정이나 화면이 바뀌었어요. 다시 시도해 주세요.');};
    try{check();await task(check);}catch(cause){if(ticket===revision.current)setError(courseErrorMessage(cause));}
    finally{working.current=false;if(ticket===revision.current)setBusy(false);}
  }
  const save=()=>void mutate(async check=>{
    const db=await getStorage();check();const result=await db.courses.save(current!.snapshot,name);check();
    if(draft)candidateDrafts.edit(draft.id,owner,{name,savedId:result.id});
    setData({...current!,name,savedId:result.id});setEditing(false);setNotice(result.created?'코스를 저장했어요.':'이미 저장한 코스를 열었어요.');
  });
  const rename=()=>void mutate(async check=>{
    if(current!.savedId){const db=await getStorage();check();await db.courses.rename(current!.savedId,name);check();}
    if(draft)candidateDrafts.edit(draft.id,owner,{name});setData({...current!,name});setEditing(false);
  });
  const exportGpx=()=>void mutate(async check=>{
    if(!current!.savedId)return;const controller=new AbortController();exporting.current=controller;
    try{await shareCourseGpx(current!.savedId,controller.signal);check();}catch(cause){throw new CourseError('validation',exportErrorMessage(cause));}
  });
  const remove=()=>Alert.alert('코스를 삭제할까요?','사용한 저장 횟수는 돌아오지 않아요. 이전 러닝 기록과 코스 사본은 유지됩니다.',[
    {text:'취소',style:'cancel'},{text:'삭제',style:'destructive',onPress:()=>void mutate(async check=>{
      const db=await getStorage();check();await db.courses.remove(current!.savedId!);check();
      if(router.canGoBack())router.back();else router.replace({pathname:'/courses',params:{view:'courses'}});
    })}]);
  const startRun=()=>void mutate(async check=>{
    const db=await getStorage();check();const active=await db.runs.active(),last=await db.courses.latestAttempt(current!.savedId,encodeSnapshot(current!.snapshot).hash);check();
    const next=courseContinuation(last,active?.id??null);
    if(next.action==='other-active'){Alert.alert('진행 중인 러닝이 있어요','먼저 현재 러닝을 재개하거나 종료해 주세요.',[{text:'취소',style:'cancel'},{text:'현재 러닝 보기',onPress:()=>openServiceTab('/run')}]);return;}
    if(next.action==='resume'){openServiceTab('/run');return;}
    const prepare=()=>openServiceTab({pathname:'/run',params:{courseId:current!.savedId!}});
    if(next.action==='new-after-stop')Alert.alert('새 도전을 시작할까요?','이전 러닝은 종료되어 새 도전으로 시작합니다.',[{text:'취소',style:'cancel'},{text:'러닝 준비',onPress:prepare}]);else prepare();
  });
  const continuation=courseContinuation(current?.last??null,current?.activeId??null);
  return <KeyboardAvoidingView style={{flex:1,backgroundColor:c.background}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView testID="course-detail" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:30,gap:24}}>
      {!current&&!error&&<ActivityIndicator accessibilityLabel="코스 불러오는 중" color={c.action}/>}
      {!current&&!!error&&<View style={{padding:24,gap:12}}><AppText accessibilityRole="alert" testID="course-detail-error">{error}</AppText><Button variant="outline" label="다시 확인" onPress={()=>void refresh()}/></View>}
      {current&&<>
        <View style={{height:Math.min(width,440)}}><MapSurface styleUrl={background?styleUrl??'':''} position={null} origin={current.snapshot.origin} routeOverlay={overlay} showTarget={showTarget}
          syntheticRoads={!background||!styleUrl||current.snapshot.source==='synthetic'?emptyRoads:undefined} terrainOverlay={expanded?terrain.overlay:undefined} routeColors={{route:'#FF5264',target:'#5197FE'}}/></View>
        <View style={{paddingHorizontal:24,gap:24}}>
          <View style={{padding:20,borderRadius:20,backgroundColor:c.surface,boxShadow:'0px 0px 5px rgba(0,0,0,0.15)',gap:14}}>
            <View style={{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:8,flexWrap:'wrap'}}><AppText testID="course-title" weight="black" variant="heading">{current.name}</AppText>
              {continuation.unfinished&&<View style={{backgroundColor:c.action,borderRadius:12,paddingHorizontal:8,paddingVertical:2}}><AppText variant="caption" weight="bold" style={{color:c.onAction}}>미완주</AppText></View>}</View>
            <View style={{height:1,backgroundColor:c.divider}}/>
            <View style={{flexDirection:'row',gap:16}}><View style={{flex:1,gap:5}}><AppText variant="caption" style={{color:c.muted}}>전체 거리</AppText><AppText family="roboto" weight="black" style={{fontSize:24}}>{current.snapshot.lengthKm.toFixed(2)}<AppText variant="label"> km</AppText></AppText></View>
              <View style={{flex:1,gap:5}}><AppText variant="caption" style={{color:c.muted}}>예상 러닝 시간</AppText><AppText family="roboto" weight="black" style={{fontSize:24}}>약 {estimatedRunningMinutes(current.snapshot.lengthKm)}<AppText variant="label">분</AppText></AppText></View></View>
          </View>
          <View style={{gap:16}}>
            <View style={{flexDirection:'row',alignItems:'center',gap:12}}><AppText variant="caption" style={{color:c.muted,width:70}}>코스명</AppText><AppText weight="bold" style={{flex:1}}>{current.name}</AppText><Pressable accessibilityRole="button" accessibilityLabel="코스 이름 수정" testID="course-edit-name" onPress={()=>setEditing(value=>!value)} style={{minWidth:48,minHeight:48,justifyContent:'center'}}><Image source={require('../../../assets/archive/edit.svg')} style={{width:16,height:16}} contentFit="contain" accessible={false}/></Pressable></View>
            {editing&&<View style={{gap:10}}><TextInput accessibilityLabel="코스 이름" testID="course-rename-input" value={name} onChangeText={setName} maxLength={COURSE_NAME_MAX} editable={!busy} style={{minHeight:48,padding:12,borderWidth:1,borderColor:c.border,borderRadius:8,color:c.text}}/><Button label="이름 적용" disabled={busy||!name.trim()} onPress={rename}/></View>}
            <AppText variant="label">코스 기준 위치   {centerLabel(current.snapshot.origin)}</AppText>
            <AppText variant="label">전체 거리   {current.snapshot.lengthKm.toFixed(2)} km</AppText>
            <AppText variant="label">예상 러닝 시간   약 {estimatedRunningMinutes(current.snapshot.lengthKm)}분</AppText>
            <DifficultyTag state={{kind:terrain.state.profile?'ready':terrain.state.status==='loading'?'loading':'error',profile:terrain.state.profile??undefined}}/>
            <View style={{backgroundColor:c.navigation,borderRadius:6,padding:16,gap:8}}><AppText weight="bold" variant="caption">참고 사항</AppText><AppText variant="caption">지도에 표시된 길과 실제 보행 가능 여부를 확인하고 교차로 신호와 현장 안내를 따라 주세요. 코스 기준 위치는 탐색 중심이며 실제 출발지는 러닝 준비에서 정해요.</AppText><AppText variant="caption">{paceExplanation}</AppText></View>
            <Button variant="outline" compact label={expanded?'경사·추가 정보 닫기':'경사·추가 정보'} onPress={()=>setExpanded(value=>!value)}/>
            {expanded&&<View style={{gap:14}}><AppText variant="caption">{courseShapes[current.snapshot.shape]} · 목표 {current.snapshot.targetKm} km</AppText><Toggle label="도형 점선" checked={showTarget} onChange={setShowTarget}/><Toggle label="배경 지도" checked={background} onChange={setBackground}/><TerrainPanel controller={terrain.controller} state={terrain.state}/></View>}
            {background&&styleUrl&&current.snapshot.source==='osm'&&<MapCredits/>}
          </View>
          {!!notice&&<AppText testID="course-save-notice" accessibilityLiveRegion="polite">{notice}</AppText>}
          {!!error&&<AppText testID="course-detail-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{color:c.danger}}>{error}</AppText>}
          {!current.savedId?<View style={{gap:12}}>
            <TextInput accessibilityLabel="저장할 코스 이름" testID="course-save-name" value={name} onChangeText={setName} maxLength={COURSE_NAME_MAX} editable={!busy} style={{minHeight:48,padding:12,borderWidth:1,borderColor:c.border,borderRadius:8,color:c.text}}/>
            <Button testID="course-save" label="코스 저장하기" disabled={busy||!name.trim()} onPress={save}/>
            <Button variant="secondary" label="GPX 파일 내보내기" disabled onPress={()=>{}}/>
            {draft&&<Button variant="secondary" label="재설정 및 재생성하기" onPress={()=>{if(router.canGoBack())router.back();else openServiceTab('/route-lab');}}/>}
            <Button label="이 코스 러닝 시작하기" disabled onPress={()=>{}}/>
            <AppText variant="caption" style={{color:c.muted}}>코스를 저장하면 러닝 준비와 GPX 내보내기를 이용할 수 있어요.</AppText>
          </View>:<View style={{gap:12}}>
            {current.snapshot.source==='osm'&&<Button testID="course-run" label={continuation.label} leading={<GenerationIcon name="run"/>} disabled={busy} onPress={startRun}/>}
            <Button testID="course-export-gpx" variant="secondary" label="GPX 파일 내보내기" disabled={busy} onPress={exportGpx}/>
            <Pressable testID="course-delete" accessibilityRole="button" disabled={busy} onPress={remove} style={{minHeight:48,justifyContent:'center',alignItems:'center'}}><AppText variant="caption" style={{color:c.muted}}>코스 삭제하기</AppText></Pressable>
          </View>}
        </View>
      </>}
    </ScrollView>
    <BottomTabBar value={draft?'courses':'archive'} bottomInset={insets.bottom} onChange={value=>{const tab=serviceTabs.find(t=>t.value===value);if(tab)openServiceTab(tab.href);}}/>
  </KeyboardAvoidingView>;
}
