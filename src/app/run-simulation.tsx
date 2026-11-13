import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, AppState, BackHandler, View } from 'react-native';
import { AppModal, AppText, Button } from '@/components/ui';
import { simulationSettings } from '@/features/running/simulation-settings';
import LiveGuidancePanel from '@/features/running/LiveGuidancePanel';
import { getStorage } from '@/modules/storage/database';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { guidanceNative } from '@/modules/guidance/native';
import { guidanceActivity } from '@/modules/guidance/activity';
import { createRunningSimulation } from '@/modules/running/simulation';
import { planApproach } from '@/modules/running/navigation';
import { defaultGuidanceOptions, validateRunCourse, type GuidanceOptions, type RunCourse } from '@/modules/running/guidance';
import type { Run } from '@/modules/running/model';
import { runFinishDestination } from '@/modules/running/finish-destination';
import { openServiceTab } from '@/features/service/open-service-tab';

export default function RunSimulationScreen(){
  const {courseId}=useLocalSearchParams<{courseId?:string}>(),auth=useAuth(),owner=auth.account?.id;
  const session=useRef<ReturnType<typeof createRunningSimulation>|null>(null),ticket=useRef(0),ownsActivity=useRef(false),focused=useRef(false),settingsToken=useRef('');
  const [settingsId,setSettingsId]=useState(''),[loadedKey,setLoadedKey]=useState('');
  const recordId=useRef(''),savingRef=useRef(false),finishedRef=useRef(false),finishRef=useRef<()=>void>(()=>{});
  const [saving,setSaving]=useState(false),[voiceError,setVoiceError]=useState('');
  const sessionKey=`${owner??''}/${courseId??''}`;
  const [active,setActive]=useState<ReturnType<typeof createRunningSimulation>|null>(null),[retry,setRetry]=useState(0),[planning,setPlanning]=useState(false);
  const [course,setCourse]=useState<RunCourse|null>(null),[state,setState]=useState<ReturnType<ReturnType<typeof createRunningSimulation>['snapshot']>|null>(null),[error,setError]=useState(''),[settings,setSettings]=useState(false),[options,setOptions]=useState<GuidanceOptions>({...defaultGuidanceOptions,voice:false,background:false});
  const clock=()=>performance.now();
  useEffect(()=>{
    const current=++ticket.current;let closed=false;
    void(async()=>{try{
      if(guidanceActivity.active())throw new Error('진행 중인 모의 안내를 종료한 뒤 다시 열어 주세요.');
      const db=await getStorage();if(!closed)setError('');if(await db.runs.active())throw new Error('진행 중인 실제 러닝을 마친 뒤 시뮬레이션을 열어 주세요.');
      const saved=await db.courses.get(courseId??'');
      if(closed||authentication.getSnapshot().account?.id!==owner)return;
      const value=validateRunCourse({id:saved.id,name:saved.name,snapshot:saved.snapshot});
      const continuation=await db.runs.simulationContinuation(courseId??'');
      const preferences=await db.account.preferences();const initialOptions={...preferences.guidance,background:false};
      recordId.current=await db.runs.newSimulationId();savingRef.current=false;finishedRef.current=false;
      if(closed||authentication.getSnapshot().account?.id!==owner)return;
      guidanceActivity.set(true);ownsActivity.current=true;setLoadedKey(sessionKey);setCourse(value);session.current=createRunningSimulation(value.snapshot.route,continuation??undefined);setActive(session.current);const token=simulationSettings.create(owner??'',initialOptions);settingsToken.current=token;setSettingsId(token);setOptions(initialOptions);setState(continuation?session.current.snapshot():session.current.play(clock()));
    }catch(cause){if(!closed)setError(cause instanceof Error?cause.message:'시뮬레이션을 열지 못했어요.');}})();
    const timer=setInterval(()=>{if(!closed&&focused.current&&AppState.currentState==='active'&&session.current?.snapshot().playing)setState(session.current.update(clock()));},100);
    const lifecycle=AppState.addEventListener('change',value=>{if(value!=='active'&&session.current)setState(session.current.pause(clock()));});
    return()=>{closed=true;simulationSettings.clear(settingsToken.current);ticket.current=current+1;clearInterval(timer);lifecycle.remove();session.current?.pause(clock());session.current=null;if(ownsActivity.current){guidanceActivity.set(false);ownsActivity.current=false;}};
  },[courseId,owner,sessionKey]);
  const persist=useCallback(async()=>{
    if(savingRef.current||finishedRef.current||!session.current||!recordId.current||!courseId)return;
    savingRef.current=true;setSaving(true);setError('');
    const current=session.current,request=recordId.current;
    setState(current.pause(clock()));
    try{
      const db=await getStorage(),recording=current.recording();
      const saved=await db.runs.saveSimulation({id:request,courseId,...recording},owner??'');
      if(session.current!==current||authentication.getSnapshot().account?.id!==owner)return;
      finishedRef.current=true;
      const destination=runFinishDestination(saved);
      if(destination.pathname==='/run-result')router.replace(destination);else openServiceTab(destination);
    }catch(cause){if(session.current===current)setError(cause instanceof Error?cause.message:'기록을 저장하지 못했어요. 종료 버튼으로 다시 시도해 주세요.');}
    finally{savingRef.current=false;setSaving(false);}
  },[courseId,owner]);
  useEffect(()=>{finishRef.current=()=>{void persist();};},[persist]);
  const confirmFinish=()=>{if(savingRef.current)return;Alert.alert('러닝을 마칠까요?','시뮬레이션 기록을 저장하고 종료해요.',[{text:'취소',style:'cancel'},{text:'종료',onPress:()=>void persist()}]);};
  useEffect(()=>{if(state?.status==='arrived')void persist();},[state?.status,persist]);
  useFocusEffect(useCallback(()=>{if(!courseId)return;focused.current=true;const prefs=simulationSettings.get(settingsToken.current,owner??'');if(prefs?.ended)finishRef.current();else if(prefs)setOptions(prefs.options);
    const back=BackHandler.addEventListener('hardwareBackPress',()=>{Alert.alert('러닝을 마칠까요?','시뮬레이션 기록을 저장하고 종료해요.',[{text:'취소',style:'cancel'},{text:'종료',onPress:()=>finishRef.current()}]);return true;});
    return()=>{back.remove();focused.current=false;if(session.current)setState(session.current.pause(clock()));};},[courseId,owner]));
  useEffect(()=>{if(!options.voice)return;guidanceNative?.prepareLive();const timer=setInterval(()=>setVoiceError(guidanceNative?.liveStatus().voiceError??''),1000);return()=>clearInterval(timer);},[options.voice]);
  const spoken=useRef(new Set<string>());
  useEffect(()=>{spoken.current.clear();return()=>{guidanceNative?.silenceLive();};},[active]);
  useEffect(()=>{
    if(!state?.playing||!options.voice||!focused.current){guidanceNative?.silenceLive();return;}
    const fresh=state.events.filter(event=>!spoken.current.has(event.id));fresh.forEach(event=>spoken.current.add(event.id));
    const event=fresh.findLast(value=>value.kind==='turn');
    if(!event||state.elapsedMs-event.timestamp>5000)return;
    guidanceNative?.prepareLive();guidanceNative?.feedbackLive(`${settingsId}:${event.id}:${performance.now()}`,event.text,event.vibrate);
  },[state,options.voice,settingsId]);
  const request=state&&active?.navigationRequest(),requestKey=request?.key;
  useEffect(()=>{
    if(!request||!course||!session.current)return;
    const controller=new AbortController(),active=session.current,current=ticket.current;let cancelled=false;
    const paused=active.pause(clock());void Promise.resolve().then(()=>{if(!cancelled){setPlanning(true);setState(paused);}});
    const timeout=setTimeout(()=>controller.abort(),30000);
    void planApproach({course:course.snapshot,position:request.position,accuracy:5,targetM:request.targetM},controller.signal).then(plan=>{
      if(!cancelled&&current===ticket.current&&session.current===active){active.setNavigation(plan);setPlanning(false);setState(focused.current&&AppState.currentState==='active'?active.play(clock()):active.snapshot());}
    },cause=>{if(!cancelled&&current===ticket.current&&session.current===active){active.setNavigation(null,cause instanceof Error?cause.message:'복귀 경로를 확인하지 못했어요.');setPlanning(false);setState(focused.current&&AppState.currentState==='active'?active.play(clock()):active.snapshot());}});
    return()=>{cancelled=true;clearTimeout(timeout);controller.abort();setPlanning(false);};
    // One plan per engine request; position changes must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[requestKey,course,retry,active]);
  if(loadedKey!==sessionKey||!course||!state||!active)return <View style={{flex:1,padding:26,gap:20}}><AppText>{error||'저장한 코스로 시뮬레이션을 준비하고 있어요.'}</AppText><Button label="돌아가기" onPress={()=>router.back()}/></View>;
  const run:Run={id:'simulation',status:state.playing||planning?'running':'paused',startedAt:0,endedAt:null,activeMs:state.elapsedMs,checkpointAt:state.elapsedMs,distanceM:state.distanceM,pointCount:0,rejectedCount:0,lastTimestamp:state.elapsedMs,segment:0,breakPending:0,resumedAt:0,reason:null};
  const command=(value:'depart'|'return'|'normal')=>{active.command(value);setState(active.play(clock()));};
  return <View style={{flex:1}}>
    <LiveGuidancePanel headerAccessory={<View style={{marginHorizontal:8,backgroundColor:'#FFF0E8',borderRadius:10,paddingHorizontal:8,paddingVertical:4,gap:2}}><AppText style={{fontSize:11,color:'#9C4308',textAlign:'center'}}>{saving?'시뮬레이션 기록 저장 중…':`시뮬레이션 ${state.speed}배속 · 모의 기록 저장`}</AppText><View style={{flexDirection:'row',gap:8,justifyContent:'center'}}>{planning&&<Button compact variant="outline" label="종료" onPress={confirmFinish}/>}<Button compact label="이탈" testID="running-simulation-depart" disabled={planning||saving} onPress={()=>command('depart')}/><Button compact label="복귀" testID="running-simulation-return" disabled={planning||saving} onPress={()=>command('return')}/><Button compact variant="outline" label="배속·다시 시작" disabled={planning||saving} onPress={()=>{setState(active.pause(clock()));setSettings(true);}}/></View></View>} onRetryNavigation={()=>setRetry(n=>n+1)} run={run} guide={{course,checkpoint:active.checkpoint(),options,state}} points={[]} now={state.elapsedMs} busy={planning||saving} error={error||(options.voice?voiceError:'')} simulationState={state} simulationPace={state.playing&&state.status!=='weak'?'6:00 /km':'—'} onOptions={setOptions} onSettings={()=>{setState(active.pause(clock()));simulationSettings.set(settingsId,owner??'',options);router.push({pathname:'/run-settings',params:{simulation:settingsId}});}} onPauseResume={()=>setState(state.playing?active.pause(clock()):active.play(clock()))} onFinish={confirmFinish}/>

    <AppModal visible={settings} title="러닝 시뮬레이션" onClose={()=>setSettings(false)} footer={<Button compact label="계속 보기" onPress={()=>{setSettings(false);setState(active.play(clock()));}}/>}>
      <AppText>기준 페이스 6분/km의 가상 위치를 실제 러닝 안내 로직에 전달해요. 지도·집중 모드와 이탈·복귀를 시험할 수 있어요.</AppText>
      <View style={{flexDirection:'row',gap:8}}>{[5,10,30].map(speed=><Button key={speed} compact label={`${speed}배속`} variant={state.speed===speed?'primary':'outline'} onPress={()=>setState(active.speed(speed,clock()))}/>)}</View>
      <Button compact variant="outline" label="처음부터 다시 시작" onPress={()=>{if(savingRef.current)return;session.current=createRunningSimulation(course.snapshot.route);setState(session.current.snapshot());setSettings(false);setActive(session.current);setState(session.current.play(clock()));}}/>
      <Button compact variant="outline" label="시뮬레이션 종료" onPress={confirmFinish}/>
    </AppModal>
  </View>;
}
