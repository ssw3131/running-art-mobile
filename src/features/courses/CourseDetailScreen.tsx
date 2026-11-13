import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ToastAndroid, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { AppText, Button } from '@/components/ui';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { useAuth } from '@/features/auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { authentication } from '@/modules/auth/runtime';
import { CourseError, COURSE_NAME_MAX, courseErrorMessage, courseShapes, encodeSnapshot, savedCourseOverlay, type CourseAttempt, type CourseSnapshot } from '@/modules/courses/model';
import { recordedPaths } from '@/modules/running/recorded-paths';
import type { RunPoint } from '@/modules/running/model';
import { courseContinuation } from '@/modules/courses/continuation';
import { shareCourseGpx, shareCourseSnapshotGpx } from '@/modules/courses/share-gpx';
import { exportErrorMessage } from '@/modules/courses/export';
import { candidateDrafts } from '@/features/course-generation/model';
import { estimatedRunningMinutes } from '@/features/course-generation/recommendation-metrics';
import { TargetVisibilityButton } from '@/features/course-generation/TargetVisibilityButton';
import { CourseInformation, courseDuration } from './CourseInformation';
import { GenerationIcon } from '@/features/course-generation/GenerationIcon';
import { usePointAddress } from '@/features/course-generation/use-point-address';
import { requestRegeneration } from '@/features/course-generation/regeneration-request';
import { useTerrain } from '@/features/terrain/use-terrain';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import { openServiceTab } from '@/features/service/open-service-tab';
import { serviceTabs } from '@/features/service/navigation';
import { useThemeColors } from '@/theme/ThemeProvider';

type Detail={owner:string;routeKey:string;name:string;snapshot:CourseSnapshot;savedId:string|null;last:CourseAttempt|null;activeId:string|null;points:RunPoint[]};
const styleUrl=mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY),emptyRoads={type:'FeatureCollection' as const,features:[]};
export default function CourseDetailScreen() {
  const params=useLocalSearchParams<{id?:string;runId?:string;draft?:string}>(),auth=useAuth(),owner=auth.account?.id??'';
  const c=useThemeColors(),insets=useSafeAreaInsets(),{width}=useWindowDimensions();
  const [data,setData]=useState<Detail|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [editing,setEditing]=useState(false),[name,setName]=useState('');
  const [showTarget,setShowTarget]=useState(true);
  const revision=useRef(0),working=useRef(false),exporting=useRef<AbortController|null>(null);
  const scrollY=useRef(0),keyboardTop=useRef<number|null>(null);
  const [keyboardInset,setKeyboardInset]=useState(0);
  const scrollRef=useRef<ScrollView>(null),saveInput=useRef<TextInput>(null),renameInput=useRef<TextInput>(null);
  const revealName=useCallback(()=>{
    const input=[saveInput.current,renameInput.current].find(value=>value?.isFocused());
    if(!input)return;
    // Measure after Android's resized window settles; both bounds use screen dp.
    // The native responder's content coordinates can leave the border under the IME.
    requestAnimationFrame(()=>{
      if(!input.isFocused())return;
      input.measureInWindow((_x,y,_width,height)=>{
        const top=keyboardTop.current??Keyboard.metrics()?.screenY;
        if(!input.isFocused()||top===undefined)return;
        const overlap=y+height+16-top;
        if(overlap>0)scrollRef.current?.scrollTo({y:scrollY.current+overlap,animated:false});
      });
    });
  },[]);
  useEffect(()=>{
    const shown=Keyboard.addListener('keyboardDidShow',event=>{keyboardTop.current=event.endCoordinates.screenY;setKeyboardInset(event.endCoordinates.height);revealName();});
    const hidden=Keyboard.addListener('keyboardDidHide',()=>{keyboardTop.current=null;setKeyboardInset(0);});
    return()=>{shown.remove();hidden.remove();};
  },[revealName]);
  const focusName=()=>{if(Keyboard.isVisible())revealName();};
  const draft=useMemo(()=>candidateDrafts.get(params.draft,owner||'guest'),[params.draft,owner]);
  const routeKey=JSON.stringify([params.id,params.runId,params.draft]);
  const current=data?.owner===owner&&data.routeKey===routeKey?data:null;
  const terrain=useTerrain(current?.snapshot.source==='osm'?current.snapshot.route:undefined,true);
  const pointAddress=usePointAddress(current?.snapshot.origin);
  const overlay=useMemo(()=>current?savedCourseOverlay(current.snapshot):null,[current]);
  const refresh=useCallback(async()=>{
    const ticket=++revision.current;setError('');
    try {
      const db=await getStorage(); let snapshot:CourseSnapshot,nameValue:string,savedId:string|null=null;
      if(draft){snapshot=draft.snapshot;nameValue=candidateDrafts.get(draft.id,owner)?.name??`${courseShapes[snapshot.shape]} 코스`;savedId=await db.courses.findHash(encodeSnapshot(snapshot).hash);if(savedId)nameValue=(await db.courses.get(savedId)).name;}
      else if(params.id){
        try{const saved=await db.courses.get(params.id);snapshot=saved.snapshot;nameValue=saved.name;savedId=saved.id;}
        catch(cause){
          if(!(cause instanceof CourseError)||cause.code!=='missing'||!params.runId)throw cause;
          const guide=await db.runs.guidance(params.runId);if(!guide)throw cause;
          snapshot=guide.course.snapshot;nameValue=guide.course.name;savedId=await db.courses.findHash(encodeSnapshot(snapshot).hash);
        }
      }else throw new Error('후보를 다시 선택해 주세요.');
      const last=await db.courses.latestAttempt(savedId??params.id??null,encodeSnapshot(snapshot).hash),active=await db.runs.active();
      const points=last&&!(last.status==='completed'&&last.courseOutcome==='finished')?await db.runs.points(last.id):[];
      if(ticket===revision.current&&(authentication.getSnapshot().account?.id??'')===owner){setData({owner,routeKey,name:nameValue,snapshot,savedId,last,points,activeId:active?.id??null});setName(nameValue);}
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
  const ensureSaved=async(check:()=>void)=>{
    if(current!.savedId)return current!.savedId;
    const db=await getStorage();check();const result=await db.courses.save(current!.snapshot,name);check();
    if(draft)candidateDrafts.edit(draft.id,owner,{name,savedId:result.id});
    setData({...current!,name,savedId:result.id});setEditing(false);
    return result.id;
  };
  const save=()=>void mutate(async check=>{await ensureSaved(check);check();ToastAndroid.show('해당 코스가 코스 보관함에 저장 되었습니다.',ToastAndroid.LONG);});
  const rename=()=>void mutate(async check=>{
    if(current!.savedId){const db=await getStorage();check();await db.courses.rename(current!.savedId,name);check();}
    if(draft)candidateDrafts.edit(draft.id,owner,{name});setData({...current!,name});setEditing(false);
  });
  const exportGpx=()=>void mutate(async check=>{
    const controller=new AbortController();exporting.current=controller;
    try{if(current!.savedId)await shareCourseGpx(current!.savedId,controller.signal);else await shareCourseSnapshotGpx(current!.snapshot,name,controller.signal);check();}catch(cause){throw new CourseError('validation',exportErrorMessage(cause));}
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
    const savedId=await ensureSaved(check);check();
    const prepare=()=>openServiceTab({pathname:'/run',params:{courseId:savedId}});
    prepare();
  });
  const openMap=()=>{
    if(!current)return;
    const id=candidateDrafts.put(current.snapshot,draft?.rank??0,owner);
    if(current.savedId)candidateDrafts.edit(id,owner,{savedId:current.savedId,name:current.name});
    router.push({pathname:'/course-map',params:{draft:id,target:showTarget?'1':'0'}});
  };
  const openTerrain=()=>{if(!current)return;const id=candidateDrafts.put(current.snapshot,draft?.rank??0,owner);router.push({pathname:'/course-terrain',params:{draft:id}});};
  const resetGeneration=()=>Alert.alert('재설정 및 재생성하기','저장하지 않은 생성 코스는 삭제되고 코스 설정 페이지로 이동합니다.',[{text:'취소',style:'cancel'},{text:'확인',onPress:regenerate}]);
  const regenerate=()=>{if(!current)return;
    const snapshot=current.snapshot;
    const request=requestRegeneration(owner,{origin:snapshot.origin,shape:snapshot.shape,targetKm:snapshot.targetKm,customTemplate:snapshot.customTemplate});
    candidateDrafts.discardUnsaved(owner);
    openServiceTab({pathname:'/route-lab',params:{resetRequest:request}});
  };
  const continuation=courseContinuation(current?.last??null,current?.activeId??null);
  return <KeyboardAvoidingView style={{flex:1,backgroundColor:c.background}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView ref={scrollRef} onContentSizeChange={()=>{if(Keyboard.isVisible())revealName();}} onScroll={event=>{scrollY.current=event.nativeEvent.contentOffset.y;}} scrollEventThrottle={16} onLayout={()=>{if(Keyboard.isVisible())revealName();}} testID="course-detail" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:30+keyboardInset,gap:24}}>
      {!current&&!error&&<ActivityIndicator accessibilityLabel="코스 불러오는 중" color={c.action}/>}
      {!current&&!!error&&<View style={{padding:24,gap:12}}><AppText accessibilityRole="alert" testID="course-detail-error">{error}</AppText><Button variant="outline" label="다시 확인" onPress={()=>void refresh()}/></View>}
      {current&&<>
        <View style={{paddingHorizontal:24,paddingTop:20,gap:12}}>
          <AppText testID="course-origin-address" variant="label">출발지 : {pointAddress.label}</AppText>
          <View style={{height:Math.min(width-48,288),borderRadius:16,overflow:'hidden'}}>
            <MapSurface styleUrl={styleUrl??''} position={null} origin={current.snapshot.origin} routeOverlay={overlay} showTarget={showTarget} interactive={false} recordedPaths={current.last&&!(current.last.status==='completed'&&current.last.courseOutcome==='finished')?recordedPaths(current.points):undefined}
              syntheticRoads={!styleUrl||current.snapshot.source==='synthetic'?emptyRoads:undefined} routeColors={{route:'#FF5264',target:'#5197FE'}}/>
            <TargetVisibilityButton testID="course-target-toggle" checked={showTarget} onChange={setShowTarget} style={{position:'absolute',left:20,bottom:18}} />
            <Pressable testID="course-map-open" accessibilityRole="button" accessibilityLabel="지도에서 코스 보기" onPress={openMap}
              style={{position:'absolute',right:24,bottom:18,width:46,height:46,borderRadius:23,borderWidth:1,borderColor:c.outline,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'}}>
              <Image source={require('../../../assets/generation/recommendations/search.svg')} style={{width:20,height:20}} contentFit="contain" accessible={false}/>
            </Pressable>
          </View>
        </View>
        <View style={{paddingHorizontal:24,gap:24}}>
          <View style={{padding:20,borderRadius:20,backgroundColor:c.surface,boxShadow:'0px 0px 5px rgba(0,0,0,0.15)',gap:14}}>
            <View style={{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:8,flexWrap:'wrap'}}><AppText testID="course-title" weight="black" variant="heading">{current.name}</AppText>
              {continuation.unfinished&&<View style={{backgroundColor:c.action,borderRadius:12,paddingHorizontal:8,paddingVertical:2}}><AppText variant="caption" weight="bold" style={{color:c.onAction}}>미완주</AppText></View>}</View>
            <View style={{height:1,backgroundColor:c.divider}}/>
            <View style={{flexDirection:'row',gap:16}}><View style={{flex:1,gap:5}}><AppText variant="body" style={{color:c.muted}}>전체 거리</AppText><AppText family="roboto" weight="black" style={{fontSize:28,lineHeight:34}}>{current.snapshot.lengthKm.toFixed(2)}<AppText variant="label"> km</AppText></AppText></View>
              <View style={{flex:1,gap:5}}><AppText variant="body" style={{color:c.muted}}>예상 러닝 시간</AppText><AppText family="roboto" weight="black" style={{fontSize:28,lineHeight:34}}>{courseDuration((estimatedRunningMinutes(current.snapshot.lengthKm)??0))}</AppText></View></View>
          </View>
          <CourseInformation name={current.name} address={pointAddress.label} distance={current.snapshot.lengthKm} minutes={estimatedRunningMinutes(current.snapshot.lengthKm)??0} terrain={{kind:terrain.state.profile?'ready':terrain.state.status==='loading'?'loading':'error',profile:terrain.state.profile??undefined}} onEdit={()=>setEditing(value=>!value)} onTerrain={openTerrain} editor={editing?<View style={{gap:10}}><TextInput ref={renameInput} onFocus={focusName} accessibilityLabel="코스 이름" testID="course-rename-input" value={name} onChangeText={setName} maxLength={COURSE_NAME_MAX} editable={!busy} style={{minHeight:48,padding:12,borderWidth:1,borderColor:c.border,borderRadius:8,color:c.text}}/><Button label="이름 적용" disabled={busy||!name.trim()} onPress={rename}/></View>:undefined}/>
          {!!notice&&<AppText testID="course-save-notice" accessibilityLiveRegion="polite">{notice}</AppText>}
          {!!error&&<AppText testID="course-detail-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{color:c.danger}}>{error}</AppText>}
          <View style={{gap:10}}>
            <View style={{flexDirection:'row',gap:6}}>
              <Button testID="course-save" variant="outline" label={current.savedId?'저장된 코스':'코스 저장하기'} disabled={busy} onPress={save} style={{flex:1}} contentStyle={{borderWidth:1}} labelStyle={{fontSize:16,color:c.muted}}/>
              <Button testID="course-export-gpx" variant="outline" label="GPX파일 다운" disabled={busy} onPress={exportGpx} style={{flex:1}} contentStyle={{borderWidth:1}} labelStyle={{fontSize:16,color:c.muted}}/>
            </View>
            <Button testID="course-reset" variant="secondary" label="재설정 및 재생성하기" disabled={busy} onPress={resetGeneration} labelStyle={{fontSize:16}}/>
            <Button testID="course-run" label={continuation.unfinished?continuation.label:'실시간 러닝 시작하기'} leading={<GenerationIcon name="run"/>} disabled={busy} onPress={startRun}/>
            {!!current.savedId&&<Pressable testID="course-delete" accessibilityRole="button" disabled={busy} onPress={remove} style={{minHeight:48,justifyContent:'center',alignItems:'center'}}><AppText variant="caption" style={{color:c.muted}}>코스 삭제하기</AppText></Pressable>}
          </View>
        </View>
      </>}
    </ScrollView>
    <BottomTabBar value={draft?'courses':'archive'} bottomInset={insets.bottom} onChange={value=>{const tab=serviceTabs.find(t=>t.value===value);if(tab)openServiceTab(tab.href);}}/>
  </KeyboardAvoidingView>;
}
