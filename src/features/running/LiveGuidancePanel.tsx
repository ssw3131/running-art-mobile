import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, AppModal, Button } from '@/components/ui';
import GuidanceMap from '@/features/guidance/GuidanceMap';
import { createRunGuidance } from '@/modules/running/guidance';
import { running } from '@/modules/running/runtime';
import { guidanceNative } from '@/modules/guidance/native';
import type { Coordinate } from '@/modules/guidance/geometry';
import type { GuidanceOptions, RunGuidance } from '@/modules/running/guidance';
import { durationLabel, elapsedMs, paceLabel, statusLabel, type Run, type RunPoint } from '@/modules/running/model';
import { Toggle } from '@/components/ui/ChoiceControl';
import { useThemeColors } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

const navy='#0D213C';
const card={backgroundColor:'#FFFFFF',borderRadius:20,padding:20,gap:12,boxShadow:'0px 0px 10px rgba(0,0,0,0.2)'} as const;
export default function LiveGuidancePanel({ run, guide, points, now, busy, onOptions, onPauseResume, onFinish, onPermission, error }: {
  run: Run; guide: RunGuidance; points: RunPoint[]; now: number; busy: boolean; onOptions(value: GuidanceOptions): void;
  onPauseResume():void; onFinish():void; onPermission():void; error:string;
}) {
  const c=useThemeColors();
  const {height}=useWindowDimensions();
  const compact=height<920;
  const unlockArmed=useRef(false);
  const [settings,setSettings]=useState(false),[locked,setLocked]=useState(false);
  const state=useMemo(()=>{
    const engine=createRunGuidance(guide.course.snapshot.route,guide.checkpoint);
    const value=run.status==='running'?engine.tick(now-run.startedAt):engine.snapshot();
    const trace:Coordinate[][]=[];let segment=-1;
    for(const point of points){if(point.segment!==segment){trace.push([]);segment=point.segment;}trace.at(-1)!.push([point.longitude,point.latitude]);}
    return {...value,trace};
  },[guide,now,points,run.startedAt,run.status]);
  const focus=guide.options.mode==='focus', off=state.status==='off-route'||state.phase==='return';
  const weak=state.status==='weak', paused=run.status!=='running';
  const background=weak||paused?navy:off?'#FC5602':'#059C54';
  const elapsed=elapsedMs(run,now),distance=(run.distanceM/1000).toFixed(2),remaining=(state.remainingM/1000).toFixed(2);
  const voice=guidanceNative?.liveStatus();
  const title=run.courseOutcome==='arrival-pending'?'한 바퀴를 완주했어요':paused?statusLabel[run.status]:weak?'GPS 신호를 기다리고 있어요':off?'코스를 벗어났어요':state.phase==='approach'?'코스로 합류하고 있어요':state.phase==='direction'?'달릴 방향을 확인하고 있어요':'코스를 따라 달리고 있어요';
  const color=focus?'#FFFFFF':c.text;
  const metric=(text:string,size:number,testID?:string)=><AppText testID={testID} style={{color,fontFamily:fonts.roboto.black,fontSize:size,lineHeight:size*1.2,textAlign:'center'}}>{text}</AppText>;
  const controls=<View style={{flexDirection:'row',gap:12,alignItems:'center',justifyContent:'space-between'}}>
    <Pressable testID="run-guidance-settings" accessibilityRole="button" accessibilityLabel="러닝 설정" disabled={busy} onPress={()=>setSettings(true)} style={{minWidth:50,minHeight:50,padding:8,borderRadius:35,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center'}}><AppText variant="caption" weight="bold" style={{color:navy}}>설정</AppText></Pressable>
    <Pressable testID={paused?'run-start':'run-pause'} accessibilityRole="button" accessibilityLabel={paused?'러닝 재개':'일시정지'} disabled={busy} onPress={onPauseResume} style={{flex:1,minHeight:70,borderRadius:35,padding:12,backgroundColor:navy,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12,opacity:busy?.45:1,boxShadow:'0px 0px 20px rgba(0,0,0,0.3)'}}>
      {!paused&&<View accessible={false} style={{flexDirection:'row',gap:5}}><View style={{height:24,width:7,backgroundColor:'#D9D9D9'}}/><View style={{height:24,width:7,backgroundColor:'#D9D9D9'}}/></View>}<AppText weight="bold" variant="heading" style={{color:'#FFFFFF'}}>{paused?'재개':'일시정지'}</AppText>
    </Pressable>
    <Pressable testID="run-finish" accessibilityRole="button" accessibilityLabel={run.courseOutcome==='arrival-pending'?'완주 확인·저장':'러닝 종료·저장'} disabled={busy} onPress={onFinish} style={{width:70,minHeight:70,padding:10,borderRadius:35,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center',gap:4}}><View accessible={false} style={{width:20,height:20,backgroundColor:navy}}/><AppText variant="label" weight="bold" style={{color:navy}}>종료</AppText></Pressable>
  </View>;
  const instruction=<View style={focus?{gap:10,alignItems:'center'}:card}>
    <View style={{width:focus?(compact?120:200):64,height:focus?(compact?120:200):64,borderRadius:100,backgroundColor:focus?(weak||paused?'#183653':off?'#A03600':'#026234'):navy,alignItems:'center',justifyContent:'center'}} accessible={false}>
      {['left','right','uturn'].includes(state.direction)?<Image source={state.direction==='uturn'?require('../../../assets/running/uturn.svg'):require('../../../assets/running/turn-left.svg')} contentFit="contain" style={{width:focus?(compact?76:125):40,height:focus?(compact?76:125):40,transform:state.direction==='right'?[{scaleX:-1}]:undefined}}/>:<AppText style={{fontSize:focus?(compact?60:100):38,lineHeight:focus?(compact?76:125):50,color:'#FFFFFF'}}>{state.direction==='arrival'?'✓':state.direction==='straight'?'↑':'⌖'}</AppText>}
    </View>
    <AppText testID="run-instruction" weight="bold" style={{color,fontSize:focus?(compact?22:28):20,lineHeight:focus?(compact?30:40):29,textAlign:focus?'center':'left'}}>{state.instruction}</AppText>
    {state.status==='normal'&&['left','right','uturn'].includes(state.direction)&&<AppText testID="run-turn-distance" weight="bold" style={{color,textAlign:'center'}}>약 {Math.max(5,Math.round(state.instructionM/5)*5)}m 앞에서</AppText>}
    {(state.phase==='approach'||state.phase==='return'||off)&&state.returnPath.length>0&&<AppText testID="run-return-distance" style={{color}}>{state.phase==='approach'?'코스 합류까지':'복귀 지점까지'} 약 {Math.round(state.returnM)}m</AppText>}
    {state.navigationError&&<Button compact variant="secondary" testID="run-navigation-retry" label="보행 경로 다시 확인" disabled={busy} onPress={()=>void running.retryNavigation()}/>}
    <AppText variant="caption" testID="run-progress" style={{color}}>코스 진행 {Math.min(100,state.totalM>0?state.progressM/state.totalM*100:0).toFixed(1)}% · 남은 거리 {remaining} km</AppText>
  </View>;
  return <SafeAreaView style={{flex:1,backgroundColor:focus?background:c.navigation}} edges={['bottom','left','right']}>
    <ScrollView contentContainerStyle={{flexGrow:1}}>
      {!focus&&<View style={{position:'absolute',inset:0}}><GuidanceMap route={guide.course.snapshot.route} state={state} positionLabel="현재 GPS 위치로 지도 이동"/></View>}
      <View pointerEvents="box-none" style={{flex:1,padding:compact?16:24,gap:compact?12:24}}>
        <View style={focus?{gap:compact?6:10}:card}>
          <AppText testID="run-status" weight="bold" style={{color,textAlign:'center'}}>{title}</AppText>
          <AppText testID="run-course-name" variant="caption" style={{color,textAlign:'center'}}>{guide.course.name}</AppText>
          {metric(`${distance} km`,focus?(compact?48:64):44,'run-distance')}
          <View style={{flexDirection:'row',justifyContent:'space-around',gap:12}}><View style={{flex:1,gap:4}}><AppText variant="label" style={{color,textAlign:'center'}}>남은 거리</AppText>{metric(`${remaining} km`,focus?30:24)}</View><View style={{flex:1,gap:4}}><AppText variant="label" style={{color,textAlign:'center'}}>러닝 시간</AppText>{metric(durationLabel(elapsed),focus?28:24,'run-duration')}</View></View>
          <AppText testID="run-pace" weight="bold" style={{color,textAlign:'center'}}>평균 페이스 {paceLabel(elapsed,run.distanceM)}</AppText>
        </View>
        {!!error&&<AppText testID="run-error" accessibilityRole="alert" style={{padding:12,backgroundColor:'#FFFFFF',color:c.danger,borderRadius:10}}>{error}</AppText>}
        {!!run.reason&&<AppText style={{padding:12,backgroundColor:'#FFFFFF',color:c.danger}}>{run.reason}</AppText>}
        <View pointerEvents="box-none" style={{flex:1,minHeight:focus?0:100}}/>
        {instruction}
        {weak&&<AppText testID="run-signal" style={{color:focus?'#FFFFFF':navy,backgroundColor:focus?undefined:'#FFFFFF'}}>하늘이 열린 곳에서 GPS를 확인해 주세요. 공백 구간은 거리에 더하지 않아요.</AppText>}
        <AppText variant="caption" style={{color:focus?'#FFFFFF':navy,backgroundColor:focus?undefined:'#FFFFFF'}}>실제 도로와 주변 상황을 확인하며 달려 주세요.</AppText>
      </View>
    </ScrollView>
    <View style={{paddingHorizontal:24,paddingTop:8,paddingBottom:16}}>{controls}</View>
    <AppModal visible={settings} title="러닝 설정" onClose={()=>setSettings(false)} presentation="sheet" footer={<View style={{gap:10}}><Button label="러닝으로 돌아가기" onPress={()=>setSettings(false)}/><Button variant="secondary" label="러닝 종료·저장" disabled={busy} onPress={()=>{setSettings(false);onFinish();}}/></View>}>
      <View style={{width:'100%',gap:16}}>
        <View style={card}><AppText variant="heading" weight="bold">안내 화면</AppText><AppText variant="caption">지도에서 위치를 보거나, 집중 모드로 방향을 크게 보세요.</AppText><Button compact variant="outline" testID="run-guidance-mode" label={focus?'지도로 보기':'집중 모드로 보기'} disabled={busy} onPress={()=>onOptions({...guide.options,mode:focus?'map':'focus'})}/></View>
        <View style={card}><Toggle testID="run-voice" label="음성 안내" checked={guide.options.voice} disabled={busy} onChange={voice=>onOptions({...guide.options,voice})}/>{guide.options.voice&&!!voice?.voiceError&&<AppText variant="caption">{voice.voiceError}</AppText>}</View>
        <View style={card}><Toggle testID="run-background" label="화면 꺼짐 중 안내·기록" checked={guide.options.background} disabled={busy} onChange={background=>onOptions({...guide.options,background})}/><AppText variant="caption">끄면 화면을 잠그거나 다른 앱으로 이동할 때 일시정지해요. 돌아와서 직접 재개해 주세요.</AppText></View>
        <View style={card}><Button compact variant="outline" testID="run-touch-lock" label="터치 잠금" onPress={()=>{setSettings(false);setLocked(true);}}/><AppText variant="caption">화면 터치로 인한 오작동을 막아요. 길게 누르거나 기기의 뒤로 가기로 해제해요.</AppText></View>
        <Button compact variant="outline" testID="run-settings" label="위치 권한 설정" onPress={onPermission}/>
      </View>
    </AppModal>
    <Modal visible={locked} animationType="fade" onRequestClose={()=>setLocked(false)}>
      <SafeAreaView style={{flex:1,backgroundColor:background,padding:32,justifyContent:'space-around',alignItems:'center'}}>
        <AppText weight="bold" variant="title" style={{color:'#FFFFFF'}}>터치 잠금</AppText>
        <View style={{gap:16}}><AppText style={{color:'#FFFFFF',fontFamily:fonts.roboto.black,fontSize:64,lineHeight:80,textAlign:'center'}}>{distance} km</AppText><AppText style={{color:'#FFFFFF',textAlign:'center'}}>{durationLabel(elapsed)} · {title}</AppText><AppText style={{color:'#FFFFFF',textAlign:'center'}}>{state.instruction}</AppText>{!!error&&<AppText accessibilityRole="alert" style={{color:'#FFFFFF'}}>{error}</AppText>}</View>
        <Pressable testID="run-touch-unlock" accessibilityRole="button" accessibilityLabel="터치 잠금 해제" accessibilityHint="길게 누르거나 접근성 활성화 동작으로 해제" accessibilityActions={[{name:'activate',label:'잠금 해제'}]} onAccessibilityAction={()=>setLocked(false)} delayLongPress={800} onPressIn={()=>{unlockArmed.current=false;}} onLongPress={()=>{unlockArmed.current=true;}} onPressOut={()=>{if(unlockArmed.current){unlockArmed.current=false;setLocked(false);}}} style={{padding:24,borderRadius:30,backgroundColor:'#FFFFFF'}}><AppText weight="bold">길게 눌러 잠금 해제</AppText></Pressable>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
