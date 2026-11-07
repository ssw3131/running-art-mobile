import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button } from '@/components/ui';
import GuidanceMap from '@/features/guidance/GuidanceMap';
import type { ReactNode } from 'react';
import type { GuidanceState } from '@/modules/guidance/engine';
import { createRunGuidance } from '@/modules/running/guidance';
import { running } from '@/modules/running/runtime';
import type { Coordinate } from '@/modules/guidance/geometry';
import type { GuidanceOptions, RunGuidance } from '@/modules/running/guidance';
import { durationLabel, elapsedMs, currentPaceLabel, statusLabel, type Run, type RunPoint } from '@/modules/running/model';
import { router } from 'expo-router';
import { ModeSwitch, RunningControls } from './RunningControls';
import { useThemeColors } from '@/theme/ThemeProvider';
import { navigationBearing } from './navigation-bearing';
import { useDeviceHeading } from './use-device-heading';
import { fonts } from '@/theme/tokens';

const navy='#0D213C';
const cardBase={borderRadius:20,padding:20,gap:12,boxShadow:'0px 0px 10px rgba(0,0,0,0.2)'} as const;
export default function LiveGuidancePanel({ run, guide, points, now, busy, onOptions, onPauseResume, onFinish, onSettings, onPermission, error, simulationState, simulationPace, headerAccessory, onRetryNavigation }: {
  run: Run; guide: RunGuidance; points: RunPoint[]; now: number; busy: boolean; onOptions(value: GuidanceOptions): void;
  headerAccessory?:ReactNode; onRetryNavigation?():void; simulationState?:GuidanceState; simulationPace?:string; onSettings?():void; onPauseResume():void; onFinish():void; onPermission():void; error:string;
}) {
  const c=useThemeColors();
  const heading=useDeviceHeading(guide.options.mode==='map');
  const card={...cardBase,backgroundColor:c.surface};
  const {height}=useWindowDimensions();
  const compact=height<800;
  const unlockArmed=useRef(false);
  const [locked,setLocked]=useState(guide.options.touchLock??false);
  const [lockPreference,setLockPreference]=useState(guide.options.touchLock??false);
  if(lockPreference!==(guide.options.touchLock??false)){setLockPreference(guide.options.touchLock??false);setLocked(guide.options.touchLock??false);}
  const state=useMemo(()=>{
    if(simulationState)return simulationState;
    const engine=createRunGuidance(guide.course.snapshot.route,guide.checkpoint);
    const value=run.status==='running'?engine.tick(now-run.startedAt):engine.snapshot();
    const trace:Coordinate[][]=[];let segment=-1;
    for(const point of points){if(point.segment!==segment){trace.push([]);segment=point.segment;}trace.at(-1)!.push([point.longitude,point.latitude]);}
    return {...value,trace};
  },[guide,now,points,run.startedAt,run.status,simulationState]);
  const focus=guide.options.mode==='focus', off=state.status==='off-route'||state.phase==='return';
  const weak=state.status==='weak', paused=run.status!=='running';
  const background=weak||paused?navy:off?'#FC5602':'#059C54';
  const elapsed=elapsedMs(run,now),distance=(run.distanceM/1000).toFixed(2),remaining=(state.remainingM/1000).toFixed(2);

  const title=simulationState?.status==='arrived'?'시뮬레이션을 완주했어요':run.courseOutcome==='arrival-pending'?'한 바퀴를 완주했어요':paused?statusLabel[run.status]:weak?'GPS 신호를 기다리고 있어요':off?'코스를 벗어났어요':state.phase==='approach'?'코스로 합류하고 있어요':state.phase==='direction'?'달릴 방향을 확인하고 있어요':'코스를 따라 달리고 있어요';
  const color=focus?'#FFFFFF':c.text;
  const metric=(text:string,size:number,testID?:string)=><AppText testID={testID} style={{color,fontFamily:fonts.roboto.black,fontSize:size,lineHeight:size*1.2,textAlign:'center'}}>{text}</AppText>;
  const controls=<RunningControls busy={busy} paused={paused} canStart={simulationState?.status!=='arrived'} onSettings={onSettings??(()=>router.push({pathname:'/run-settings',params:{runId:run.id}}))} onStartPause={onPauseResume} onFinish={onFinish}/>;
  const pace=simulationPace??currentPaceLabel(points,now,!paused);
  const instruction=<View style={focus?{gap:10,alignItems:'center'}:{...card,flexDirection:'row',alignItems:'center',padding:16,gap:14}}>
    <View style={{width:focus?(compact?160:200):48,height:focus?(compact?160:200):48,borderRadius:100,backgroundColor:focus?(weak||paused?'#183653':off?'#A03600':'#026234'):'transparent',alignItems:'center',justifyContent:'center'}} accessible={false}>
      {state.direction==='straight'?<Image source={require('../../../assets/running/straight.svg')} tintColor={focus?'#FFFFFF':'#14AE5C'} style={{width:focus?125:48,height:focus?125:48}}/>:['left','right','uturn'].includes(state.direction)?<Image source={!focus&&state.direction!=='uturn'?require('../../../assets/running/turn-map.svg'):state.direction==='uturn'?require('../../../assets/running/uturn.svg'):require('../../../assets/running/turn-left.svg')} contentFit="contain" style={{width:focus?125:48,height:focus?125:48,transform:state.direction==='right'?[{scaleX:-1}]:[]}}/>:<AppText style={{fontSize:focus?48:14,lineHeight:focus?64:22,color:focus?'#FFFFFF':c.muted}}>{state.direction==='arrival'?'완주':'GPS'}</AppText>}
    </View>
    <View style={{flex:focus?undefined:1,gap:8}}><AppText testID="run-instruction" weight="bold" style={{color,fontSize:focus?(compact?24:36):20,lineHeight:focus?(compact?32:48):29,textAlign:focus?'center':'left'}}>{state.instruction}</AppText>
    {state.status==='normal'&&['left','right','uturn'].includes(state.direction)&&<AppText testID="run-turn-distance" weight="bold" style={{color,textAlign:'center'}}>약 {Math.max(5,Math.round(state.instructionM/5)*5)}m 앞에서</AppText>}
    {(state.phase==='approach'||state.phase==='return'||off)&&state.returnPath.length>0&&<AppText testID="run-return-distance" style={{color}}>{state.phase==='approach'?'코스 합류까지':'복귀 지점까지'} 약 {Math.round(state.returnM)}m</AppText>}
    {state.navigationError&&<Button compact variant="secondary" testID="run-navigation-retry" label="보행 경로 다시 확인" disabled={busy} onPress={()=>onRetryNavigation?onRetryNavigation():void running.retryNavigation()}/>}
</View>
  </View>;
  const mapStats=<View style={{...card,paddingHorizontal:16,paddingVertical:6,gap:4}}>
    <AppText testID="run-distance" family="roboto" weight="black" style={{fontSize:44,lineHeight:44,textAlign:'center'}}>{distance}<AppText weight="bold" style={{fontSize:20,lineHeight:24}}> km</AppText></AppText>
    <View style={{height:1,backgroundColor:'#E5E5E5'}}/>
    <View style={{flexDirection:'row',gap:10}}>{[{label:'남은 거리',value:`${remaining} km`},{label:'러닝 시간',value:durationLabel(elapsed)},{label:'현재 페이스',value:pace.replace(' /km','')}].map(item=><View key={item.label} style={{flex:1,alignItems:'center',gap:2}}><AppText style={{fontSize:12,lineHeight:14,color:c.muted}}>{item.label}</AppText><AppText family="roboto" weight="black" numberOfLines={1} adjustsFontSizeToFit style={{fontSize:26,lineHeight:28,color:c.text}}>{item.value}</AppText></View>)}</View>
  </View>;
  return <SafeAreaView style={{flex:1,backgroundColor:focus?background:c.navigation}} edges={['top','bottom','left','right']}>
    {!focus&&<View style={{position:'absolute',inset:0}}><GuidanceMap followLock heading={navigationBearing(guide.course.snapshot.route,state,guide.checkpoint)??heading} route={guide.course.snapshot.route} state={state} positionLabel={simulationState?"시뮬레이션 위치로 지도 이동":"현재 GPS 위치로 지도 이동"} recenterAtBottom/></View>}
    {headerAccessory}
    {focus?<ScrollView contentContainerStyle={{flexGrow:1,paddingHorizontal:32,paddingTop:compact?16:30,gap:compact?8:20,paddingBottom:20,alignItems:'center'}}>
      <AppText testID="run-status" weight="bold" style={{color:'#FFFFFF',fontSize:compact?20:24,textAlign:'center'}}>{title}</AppText>
      <AppText style={{color:'#FFFFFF',textAlign:'center'}}>{guide.course.name}</AppText>
      {metric(pace.replace(' /km',''),compact?48:64,'run-pace')}
      <AppText style={{color:'#FFFFFF'}}>현재 페이스 · /km</AppText>
      <View style={{flexDirection:'row',gap:12,width:'100%'}}>{[{label:'러닝 시간',value:durationLabel(elapsed),id:'run-duration'},{label:'이동 거리',value:`${distance} km`,id:'run-distance'}].map(item=><View key={item.label} style={{flex:1,padding:compact?10:16,gap:compact?4:8,backgroundColor:'#FFFFFF33',borderRadius:16}}><AppText style={{color:'#FFFFFF',textAlign:'center'}}>{item.label}</AppText>{metric(item.value,compact?24:28,item.id)}</View>)}</View>
      <AppText weight="bold" style={{fontSize:compact?24:32,color:'#FFFFFF'}}>남은 거리 {remaining} km</AppText>
      {instruction}
      {weak&&<Button compact variant="outline" testID="run-settings" label="위치 권한 설정" onPress={onPermission}/>}
      {!!error&&<AppText accessibilityRole="alert" style={{color:'#FFFFFF'}}>{error}</AppText>}
    </ScrollView>:<View pointerEvents="box-none" style={{flex:1,paddingHorizontal:32,paddingTop:24,gap:12}}>
      {mapStats}
      {weak&&<Button compact variant="outline" testID="run-settings" label="위치 권한 설정" onPress={onPermission}/>}
      <AppText testID="run-status" style={{color:navy,backgroundColor:'#FFFFFF',borderRadius:8,padding:6}}>{title}</AppText>
      {!!error&&<AppText accessibilityRole="alert" style={{color:c.danger,backgroundColor:'#FFFFFF',padding:12}}>{error}</AppText>}
      {!!run.reason&&<AppText accessibilityRole="alert" style={{color:c.danger,backgroundColor:'#FFFFFF',padding:12}}>{run.reason}</AppText>}
      <View pointerEvents="box-none" style={{flex:1}}/>
      {instruction}
    </View>}
    <ModeSwitch focus={focus} onChange={()=>onOptions({...guide.options,mode:focus?'map':'focus'})}/>{controls}
    <Modal visible={locked} animationType="fade" onRequestClose={()=>setLocked(false)}>
      <SafeAreaView style={{flex:1,backgroundColor:background,padding:32,justifyContent:'space-around',alignItems:'center'}}>
        <AppText weight="bold" variant="title" style={{color:'#FFFFFF'}}>터치 잠금</AppText>
        <View style={{gap:16}}><AppText style={{color:'#FFFFFF',fontFamily:fonts.roboto.black,fontSize:64,lineHeight:80,textAlign:'center'}}>{distance} km</AppText><AppText style={{color:'#FFFFFF',textAlign:'center'}}>{durationLabel(elapsed)} · {title}</AppText><AppText style={{color:'#FFFFFF',textAlign:'center'}}>{state.instruction}</AppText>{!!error&&<AppText accessibilityRole="alert" style={{color:'#FFFFFF'}}>{error}</AppText>}</View>
        <Pressable testID="run-touch-unlock" accessibilityRole="button" accessibilityLabel="터치 잠금 해제" accessibilityHint="길게 누르거나 접근성 활성화 동작으로 해제" accessibilityActions={[{name:'activate',label:'잠금 해제'}]} onAccessibilityAction={()=>setLocked(false)} delayLongPress={800} onPressIn={()=>{unlockArmed.current=false;}} onLongPress={()=>{unlockArmed.current=true;}} onPressOut={()=>{if(unlockArmed.current){unlockArmed.current=false;setLocked(false);}}} style={{padding:24,borderRadius:30,backgroundColor:'#FFFFFF'}}><AppText weight="bold" style={{color:navy}}>길게 눌러 잠금 해제</AppText></Pressable>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
