import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { ActivityIndicator, Alert, AppState, BackHandler, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { getStorage } from '@/modules/storage/database';
import { courseErrorMessage } from '@/modules/courses/model';
import { createGuidance } from '@/modules/guidance/engine';
import GuidanceMap from '@/features/guidance/GuidanceMap';
import { validateRunCourse, type RunCourse, type RunPreparation } from '@/modules/running/guidance';
import type { Fix } from '@/modules/running/model';
import { AppText as Text, AppModal, Button } from '@/components/ui';
import { usePreparationApproach } from './use-preparation-approach';
import { RunningControls } from './RunningControls';

export default function CourseRunPreparation({ id, busy, onStart }: { id: string; busy: boolean; onStart(prepared: RunPreparation): void }) {
  const insets=useSafeAreaInsets();
  const [notice,setNotice]=useState(true),[course,setCourse]=useState<RunCourse|null>(null),[fix,setFix]=useState<Fix|null>(null),[error,setError]=useState(''),[skipped,setSkipped]=useState(false);
  const latestFix=useRef<Fix|null>(null);
  const generation=useRef(0),subscription=useRef<Location.LocationSubscription|null>(null),locating=useRef<number|null>(null);
  const cancelPreparation=useCallback(()=>{if(!busy)router.setParams({courseId:undefined});},[busy]);
  useFocusEffect(useCallback(()=>{
    const back=BackHandler.addEventListener('hardwareBackPress',()=>{cancelPreparation();return true;});
    return()=>back.remove();
  },[cancelPreparation]));
  const locate=useCallback(async()=>{
    if(locating.current!==null)return;
    const ticket=++generation.current;locating.current=ticket;subscription.current?.remove();subscription.current=null;setError('');setFix(null);latestFix.current=null;
    try{
      const saved=await(await getStorage()).courses.get(id);
      if(ticket!==generation.current)return;
      setCourse(validateRunCourse({id:saved.id,name:saved.name,snapshot:saved.snapshot}));
      let permission=await Location.getForegroundPermissionsAsync();
      if(!permission.granted)permission=await Location.requestForegroundPermissionsAsync();
      if(!permission.granted||permission.android?.accuracy!=='fine')throw new Error('location-settings');
      if(!await Location.hasServicesEnabledAsync())throw new Error('GPS');
      if(ticket!==generation.current||AppState.currentState!=='active')return;
      const watch=await Location.watchPositionAsync({accuracy:Location.Accuracy.BestForNavigation,timeInterval:1000,distanceInterval:0,mayShowUserSettingsDialog:false},value=>{
        if(ticket!==generation.current)return;
        const next={timestamp:value.timestamp,latitude:value.coords.latitude,longitude:value.coords.longitude,accuracy:value.coords.accuracy};latestFix.current=next;setFix(next);
      });
      if(ticket===generation.current)subscription.current=watch;else watch.remove();
    }catch(cause){if(ticket===generation.current)setError(cause instanceof Error&&['location-settings','GPS'].includes(cause.message)?'정확한 위치를 허용하고 기기의 GPS를 켜 주세요.':courseErrorMessage(cause));}
    finally{if(locating.current===ticket)locating.current=null;}
  },[id]);
  useFocusEffect(useCallback(()=>{
    void locate();
    const state=AppState.addEventListener('change',value=>{if(value==='background'){generation.current++;locating.current=null;subscription.current?.remove();subscription.current=null;setFix(null);latestFix.current=null;}if(value==='active'&&!subscription.current)void locate();});
    return()=>{generation.current++;locating.current=null;subscription.current?.remove();subscription.current=null;latestFix.current=null;state.remove();};
  },[locate]));
  const approach=usePreparationApproach(course,fix,!busy&&!skipped);
  useFocusEffect(useCallback(()=>{
    if(!notice||approach.ready)return;
    const timer=setTimeout(()=>{setSkipped(true);setNotice(false);ToastAndroid.show('코스 이동 경로를 찾지 못했어요. 지도에서 코스를 확인해 주세요.',ToastAndroid.LONG);},approach.error?0:10000);
    return()=>clearTimeout(timer);
  },[notice,approach.ready,approach.error]));
  const preview=course?createGuidance(course.snapshot.route).snapshot():null;
  if(preview){preview.phase='approach';preview.lapStart=null;
    if(fix){preview.position=[fix.longitude,fix.latitude];if(approach.plan)preview.returnPath=approach.plan.path;}
  }
  const finish=()=>Alert.alert('러닝 준비를 마칠까요?','코스 선택 화면으로 돌아갑니다.',[{text:'취소',style:'cancel'},{text:'확인',onPress:()=>router.setParams({courseId:undefined})}]);
  return <View style={{flex:1}}>
    {course&&preview&&<View style={{position:'absolute',inset:0}}><GuidanceMap route={course.snapshot.route} state={preview} positionLabel="현재 위치로 이동" showPosition={!!fix} recenterAtBottom onRecenter={()=>{if(!fix)void locate();}} recenterBottom={180+insets.bottom}/></View>}
    <View pointerEvents="box-none" style={{flex:1,paddingTop:insets.top+12,paddingHorizontal:26}}>
      {!!approach.error&&<Button compact variant="outline" label={approach.error} onPress={approach.retry}/>}
      {!!error&&<Button compact variant="outline" label={error} onPress={()=>void locate()}/>}
    </View>
    <View style={{paddingHorizontal:26,paddingBottom:8}}><Button testID="run-simulation-open" compact variant="outline" label="러닝 시뮬레이션 · 30배속" disabled={busy||!course} onPress={()=>{router.setParams({courseId:undefined});router.push({pathname:'/run-simulation',params:{courseId:id}});}}/></View>
    <View style={{paddingBottom:insets.bottom}}><RunningControls busy={busy} paused preparation canStart={!!course} onSettings={()=>router.push('/run-settings')} onStartPause={()=>onStart({courseId:id,read:()=>({fix:latestFix.current,plan:approach.readPlan()})})} onFinish={finish}/></View>
    <AppModal icon={<Image source={require('../../../assets/generation/run.svg')} tintColor="#FC5602" style={{width:34,height:34}}/>} visible={notice} title="코스 위에서 러닝을 시작해요." onClose={cancelPreparation} footer={<Button testID="run-preparation-confirm" compact variant="outline" label="확인" disabled={busy||!approach.ready||!!error} style={{width:212,alignSelf:'center'}} onPress={()=>setNotice(false)}/>}><Text style={{textAlign:'center',fontSize:13,color:'#828387'}}>{'현재 위치 버튼을 눌러 내 위치를 확인한 뒤,\n지도 위 코스 라인 가까이 이동하세요.\n\n준비가 되면 하단의 시작 버튼을 눌러\n러닝을 시작할 수 있어요.'}</Text>{(!approach.ready||!!error)&&<View style={{alignItems:'center',gap:8,marginTop:12}}>{!error&&!approach.error&&<><ActivityIndicator color="#FC5602"/><Text testID="run-preparation-loading" accessibilityLiveRegion="polite" style={{fontSize:13,textAlign:'center'}}>{fix?'코스까지 도보 경로를 준비하고 있어요.':'현재 위치를 확인하고 있어요.'}</Text></>}{!!(error||approach.error)&&<><Text accessibilityRole="alert" style={{fontSize:13,textAlign:'center'}}>{error||approach.error}</Text><Button compact variant="outline" label="다시 확인" onPress={()=>{if(error)void locate();else approach.retry();}}/></>}</View>}</AppModal>
  </View>;
}
