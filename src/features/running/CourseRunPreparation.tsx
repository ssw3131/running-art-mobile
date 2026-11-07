import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { Alert, AppState, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { getStorage } from '@/modules/storage/database';
import { courseErrorMessage } from '@/modules/courses/model';
import { createGuidance } from '@/modules/guidance/engine';
import { courseProjection } from '@/modules/guidance/loop-engine';
import { positionAt, prepareRoute } from '@/modules/guidance/geometry';
import GuidanceMap from '@/features/guidance/GuidanceMap';
import { startReadiness, validateRunCourse, type RunCourse } from '@/modules/running/guidance';
import type { Fix } from '@/modules/running/model';
import { AppText as Text, AppModal, Button } from '@/components/ui';
import { RunningControls } from './RunningControls';

export default function CourseRunPreparation({ id, busy, onStart }: { id: string; busy: boolean; onStart(): void }) {
  const insets=useSafeAreaInsets();
  const [notice,setNotice]=useState(true),[course,setCourse]=useState<RunCourse|null>(null),[fix,setFix]=useState<Fix|null>(null),[error,setError]=useState(''),[now,setNow]=useState(0);
  const generation=useRef(0),subscription=useRef<Location.LocationSubscription|null>(null),locating=useRef<number|null>(null);
  const locate=useCallback(async()=>{
    if(locating.current!==null)return;
    const ticket=++generation.current;locating.current=ticket;subscription.current?.remove();subscription.current=null;setError('');setFix(null);
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
        setFix({timestamp:value.timestamp,latitude:value.coords.latitude,longitude:value.coords.longitude,accuracy:value.coords.accuracy});setNow(Date.now());
      });
      if(ticket===generation.current)subscription.current=watch;else watch.remove();
    }catch(cause){if(ticket===generation.current)setError(cause instanceof Error&&['location-settings','GPS'].includes(cause.message)?'정확한 위치를 허용하고 기기의 GPS를 켜 주세요.':courseErrorMessage(cause));}
    finally{if(locating.current===ticket)locating.current=null;}
  },[id]);
  useFocusEffect(useCallback(()=>{
    void locate();const timer=setInterval(()=>setNow(Date.now()),1000);
    const state=AppState.addEventListener('change',value=>{if(value==='background'){generation.current++;locating.current=null;subscription.current?.remove();subscription.current=null;setFix(null);}if(value==='active'&&!subscription.current)void locate();});
    return()=>{generation.current++;locating.current=null;subscription.current?.remove();subscription.current=null;clearInterval(timer);state.remove();};
  },[locate]));
  const readiness=course?startReadiness(course,fix,now):null;
  const preview=course?createGuidance(course.snapshot.route).snapshot():null;
  if(preview){preview.phase='approach';preview.lapStart=null;
    if(fix){preview.position=[fix.longitude,fix.latitude];const nearest=courseProjection(course!.snapshot.route,preview.position);preview.returnPath=[preview.position,positionAt(prepareRoute(course!.snapshot.route),nearest.meters)];}
  }
  const finish=()=>Alert.alert('러닝 준비를 마칠까요?','코스 선택 화면으로 돌아갑니다.',[{text:'취소',style:'cancel'},{text:'확인',onPress:()=>router.setParams({courseId:undefined})}]);
  return <View style={{flex:1}}>
    {course&&preview&&<View style={{position:'absolute',inset:0}}><GuidanceMap route={course.snapshot.route} state={preview} positionLabel="현재 위치로 이동" showPosition={!!fix} recenterAtBottom onRecenter={()=>{if(!fix)void locate();}} recenterBottom={180+insets.bottom}/></View>}
    <View pointerEvents="box-none" style={{flex:1,paddingTop:insets.top+12,paddingHorizontal:26}}>
      {!!error&&<Button compact variant="outline" label={error} onPress={()=>void locate()}/>}
    </View>
    <View style={{paddingHorizontal:26,paddingBottom:8}}><Button testID="run-simulation-open" compact variant="outline" label="러닝 시뮬레이션 · 30배속" disabled={busy||!course} onPress={()=>router.push({pathname:'/run-simulation',params:{courseId:id}})}/></View>
    <View style={{paddingBottom:insets.bottom}}><RunningControls busy={busy} paused preparation canStart={!!readiness?.ready} onSettings={()=>router.push('/run-settings')} onStartPause={onStart} onFinish={finish}/></View>
    <AppModal icon={<Image source={require('../../../assets/generation/run.svg')} tintColor="#FC5602" style={{width:34,height:34}}/>} visible={notice} title="코스 위에서 러닝을 시작해요." onClose={()=>setNotice(false)} footer={<Button testID="run-preparation-confirm" compact variant="outline" label="확인" style={{width:212,alignSelf:'center'}} onPress={()=>setNotice(false)}/>}><Text style={{textAlign:'center',fontSize:13,color:'#828387'}}>{'현재 위치 버튼을 눌러 내 위치를 확인한 뒤,\n지도 위 코스 라인 가까이 이동하세요.\n\n준비가 되면 하단의 시작 버튼을 눌러\n러닝을 시작할 수 있어요.'}</Text></AppModal>
  </View>;
}
