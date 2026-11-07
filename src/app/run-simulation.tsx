import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppState, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal, AppText, Button } from '@/components/ui';
import LiveGuidancePanel from '@/features/running/LiveGuidancePanel';
import { getStorage } from '@/modules/storage/database';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { guidanceActivity } from '@/modules/guidance/activity';
import { createRunningSimulation } from '@/modules/running/simulation';
import { planApproach } from '@/modules/running/navigation';
import { defaultGuidanceOptions, validateRunCourse, type GuidanceOptions, type RunCourse } from '@/modules/running/guidance';
import type { Run } from '@/modules/running/model';

export default function RunSimulationScreen(){
  const {courseId}=useLocalSearchParams<{courseId?:string}>(),auth=useAuth(),owner=auth.account?.id,insets=useSafeAreaInsets();
  const session=useRef<ReturnType<typeof createRunningSimulation>|null>(null),ticket=useRef(0),ownsActivity=useRef(false);
  const [active,setActive]=useState<ReturnType<typeof createRunningSimulation>|null>(null),[retry,setRetry]=useState(0),[planning,setPlanning]=useState(false);
  const [course,setCourse]=useState<RunCourse|null>(null),[state,setState]=useState<ReturnType<ReturnType<typeof createRunningSimulation>['snapshot']>|null>(null),[error,setError]=useState(''),[settings,setSettings]=useState(false),[options,setOptions]=useState<GuidanceOptions>({...defaultGuidanceOptions,voice:false,background:false});
  const clock=()=>performance.now();
  useFocusEffect(useCallback(()=>{
    const current=++ticket.current;let closed=false;setCourse(null);setActive(null);setState(null);setError('');
    void(async()=>{try{
      if(guidanceActivity.active())throw new Error('진행 중인 모의 안내를 종료한 뒤 다시 열어 주세요.');
      const db=await getStorage();if(await db.runs.active())throw new Error('진행 중인 실제 러닝을 마친 뒤 시뮬레이션을 열어 주세요.');
      const saved=await db.courses.get(courseId??'');
      if(closed||authentication.getSnapshot().account?.id!==owner)return;
      const value=validateRunCourse({id:saved.id,name:saved.name,snapshot:saved.snapshot});
      guidanceActivity.set(true);ownsActivity.current=true;setCourse(value);session.current=createRunningSimulation(value.snapshot.route);setActive(session.current);setState(session.current.play(clock()));
    }catch(cause){if(!closed)setError(cause instanceof Error?cause.message:'시뮬레이션을 열지 못했어요.');}})();
    const timer=setInterval(()=>{if(!closed&&AppState.currentState==='active'&&session.current?.snapshot().playing)setState(session.current.update(clock()));},100);
    const lifecycle=AppState.addEventListener('change',value=>{if(value!=='active'&&session.current)setState(session.current.pause(clock()));});
    return()=>{closed=true;ticket.current=current+1;clearInterval(timer);lifecycle.remove();session.current?.pause(clock());session.current=null;if(ownsActivity.current){guidanceActivity.set(false);ownsActivity.current=false;}};
  },[courseId,owner]));
  const request=state&&active?.navigationRequest(),requestKey=request?.key;
  useEffect(()=>{
    if(!request||!course||!session.current)return;
    const controller=new AbortController(),active=session.current,current=ticket.current;let cancelled=false;
    setPlanning(true);setState(active.pause(clock()));
    void planApproach({course:course.snapshot,position:request.position,accuracy:5,targetM:request.targetM},controller.signal).then(plan=>{
      if(!cancelled&&current===ticket.current&&session.current===active){active.setNavigation(plan);setPlanning(false);setState(AppState.currentState==='active'?active.play(clock()):active.snapshot());}
    },cause=>{if(!cancelled&&current===ticket.current&&session.current===active){active.setNavigation(null,cause instanceof Error?cause.message:'복귀 경로를 확인하지 못했어요.');setPlanning(false);setState(AppState.currentState==='active'?active.play(clock()):active.snapshot());}});
    return()=>{cancelled=true;controller.abort();setPlanning(false);};
    // One plan per engine request; position changes must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[requestKey,course,retry]);
  if(!course||!state||!active)return <View style={{flex:1,padding:26,gap:20}}><AppText>{error||'저장한 코스로 시뮬레이션을 준비하고 있어요.'}</AppText><Button label="돌아가기" onPress={()=>router.back()}/></View>;
  const run:Run={id:'simulation',status:state.playing?'running':'paused',startedAt:0,endedAt:null,activeMs:state.elapsedMs,checkpointAt:state.elapsedMs,distanceM:state.distanceM,pointCount:0,rejectedCount:0,lastTimestamp:state.elapsedMs,segment:0,breakPending:0,resumedAt:0,reason:null};
  const command=(value:'depart'|'return'|'normal')=>{active.command(value);setState(active.play(clock()));};
  return <View style={{flex:1,marginTop:-insets.top}}>
    <LiveGuidancePanel headerAccessory={<View style={{marginHorizontal:8,backgroundColor:'#FFF0E8',borderRadius:10,paddingHorizontal:8,paddingVertical:4,gap:2}}><AppText style={{fontSize:11,color:'#9C4308',textAlign:'center'}}>{state.status==='arrived'?'시뮬레이션 완주 · 실제 기록 저장 없음':`시뮬레이션 ${state.speed}배속 · 실제 기록 저장 없음`}</AppText><View style={{flexDirection:'row',gap:8,justifyContent:'center'}}><Button compact label="이탈" testID="running-simulation-depart" disabled={planning} onPress={()=>command('depart')}/><Button compact label="복귀" testID="running-simulation-return" disabled={planning} onPress={()=>command('return')}/><Button compact variant="outline" label="배속·다시 시작" disabled={planning} onPress={()=>{setState(active.pause(clock()));setSettings(true);}}/></View></View>} onRetryNavigation={()=>setRetry(n=>n+1)} run={run} guide={{course,checkpoint:active.checkpoint(),options,state}} points={[]} now={state.elapsedMs} busy={planning} error={error} simulationState={state} simulationPace={state.playing&&state.status!=='weak'?'6:00 /km':'—'} onOptions={setOptions} onSettings={()=>{setState(active.pause(clock()));setSettings(true);}} onPauseResume={()=>setState(state.playing?active.pause(clock()):active.play(clock()))} onFinish={()=>router.back()} onPermission={()=>{}}/>

    <AppModal visible={settings} title="러닝 시뮬레이션" onClose={()=>setSettings(false)} footer={<Button compact label="계속 보기" onPress={()=>{setSettings(false);setState(active.play(clock()));}}/>}>
      <AppText>기준 페이스 6분/km의 가상 위치를 실제 러닝 안내 로직에 전달해요. 지도·집중 모드와 이탈·복귀를 시험할 수 있어요.</AppText>
      <View style={{flexDirection:'row',gap:8}}>{[5,10,30].map(speed=><Button key={speed} compact label={`${speed}배속`} variant={state.speed===speed?'primary':'outline'} onPress={()=>setState(active.speed(speed,clock()))}/>)}</View>
      <Button compact variant="outline" label="처음부터 다시 시작" onPress={()=>{session.current=createRunningSimulation(course.snapshot.route);setState(session.current.snapshot());setSettings(false);setActive(session.current);setState(session.current.play(clock()));}}/>
      <Button compact variant="outline" label="시뮬레이션 종료" onPress={()=>router.back()}/>
    </AppModal>
  </View>;
}
