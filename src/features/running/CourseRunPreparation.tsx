import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { Alert, AppState, View } from 'react-native';
import { getStorage } from '@/modules/storage/database';
import { courseErrorMessage } from '@/modules/courses/model';
import { createGuidance } from '@/modules/guidance/engine';
import GuidanceMap from '@/features/guidance/GuidanceMap';
import { startReadiness, validateRunCourse, type RunCourse } from '@/modules/running/guidance';
import type { Fix } from '@/modules/running/model';
import { defaultAccountPreferences } from '@/modules/account/model';
import { planApproach } from '@/modules/running/navigation';
import type { ApproachPlan } from '@/modules/running/approach';
import { Image } from 'expo-image';
import { useThemeColors } from '@/theme/ThemeProvider';
import { RunButton, useRunStyles } from './ui';
import { AppText as Text, AppModal, Button } from '@/components/ui';
import { ModeSwitch, RunningControls } from './RunningControls';

export default function CourseRunPreparation({ id, busy, onStart }: { id: string; busy: boolean; onStart(): void }) {
  const styles = useRunStyles(),c=useThemeColors();
  const [notice,setNotice]=useState(true),[focus,setFocus]=useState(false);
  const [course, setCourse] = useState<RunCourse | null>(null), [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState(''), [now, setNow] = useState(0);
  const [plan,setPlan]=useState<ApproachPlan|null>(null),[planning,setPlanning]=useState(false);
  const planController=useRef<AbortController|null>(null);
  const [background, setBackground] = useState(defaultAccountPreferences.guidance.background);
  const generation = useRef(0), subscription = useRef<Location.LocationSubscription | null>(null), locating = useRef<number | null>(null);
  const locate = useCallback(async () => {
    if (locating.current !== null) return;
    const ticket = ++generation.current; locating.current = ticket;
    subscription.current?.remove(); subscription.current = null; planController.current?.abort(); setPlan(null); setError(''); setFix(null);
    try {
      const saved = await (await getStorage()).courses.get(id);
      const preferences = await (await getStorage()).account.preferences();
      const c = validateRunCourse({ id: saved.id, name: saved.name, snapshot: saved.snapshot });
      if (ticket !== generation.current) return;
      setCourse(c);
      setBackground(preferences.guidance.background);setFocus(preferences.guidance.mode==='focus');
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || permission.android?.accuracy !== 'fine') throw new Error('location-settings');
      if (!await Location.hasServicesEnabledAsync()) throw new Error('GPS');
      if (ticket !== generation.current || AppState.currentState !== 'active') return;
      const watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0, mayShowUserSettingsDialog: false }, value => {
        if (ticket !== generation.current) return;
        setFix({ timestamp: value.timestamp, latitude: value.coords.latitude, longitude: value.coords.longitude, accuracy: value.coords.accuracy }); setNow(Date.now());
      });
      if (ticket === generation.current) subscription.current = watch; else watch.remove();
    } catch (cause) {
      if (ticket === generation.current) setError(cause instanceof Error && ['location-settings', 'GPS'].includes(cause.message) ? '위치 설정에서 정확한 위치를 허용하고 기기의 GPS를 켜 주세요.' : courseErrorMessage(cause));
    } finally { if (locating.current === ticket) locating.current = null; }
  }, [id]);
  useFocusEffect(useCallback(() => {
    void locate();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const state = AppState.addEventListener('change', value => {
      if (value === 'background' && locating.current === null) { generation.current++; planController.current?.abort(); subscription.current?.remove(); subscription.current = null; setFix(null); }
      if (value === 'active' && !subscription.current) void locate();
    });
    return () => { generation.current++; locating.current = null; planController.current?.abort(); subscription.current?.remove(); subscription.current = null; clearInterval(timer); state.remove(); };
  }, [locate]));
  async function preparePath(){
    if(!course||!fix||planning)return;
    const ticket=generation.current,cancel=new AbortController();planController.current=cancel;setPlanning(true);setError('');setPlan(null);
    try{const value=await planApproach({course:course.snapshot,position:[fix.longitude,fix.latitude],accuracy:fix.accuracy??30},cancel.signal);if(ticket===generation.current&&!cancel.signal.aborted)setPlan(value);}
    catch(cause){if(ticket===generation.current&&!cancel.signal.aborted)setError(cause instanceof Error?cause.message:'합류 경로를 준비하지 못했어요.');}
    finally{if(planController.current===cancel){planController.current=null;setPlanning(false);}}
  }
  const readiness = course ? startReadiness(course, fix, now, plan) : null;
  const preview = course ? createGuidance(course.snapshot.route).snapshot() : null;
  if (preview && fix) preview.position = [fix.longitude, fix.latitude];
  if(preview){preview.phase='approach';preview.lapStart=null;if(plan){preview.returnPath=plan.path;preview.returnM=plan.distanceM;}}
  const finish=()=>Alert.alert('러닝 준비를 마칠까요?','기록을 시작하지 않고 코스 선택 화면으로 돌아갑니다.',[{text:'취소',style:'cancel'},{text:'확인',onPress:()=>router.setParams({courseId:undefined})}]);
  return <View style={{flex:1,backgroundColor:focus?'#059C54':c.background}}>
    {course&&preview&&!focus&&<View style={{position:'absolute',inset:0}}><GuidanceMap route={course.snapshot.route} state={preview} positionLabel="현재 위치로 지도 이동" showPosition={!!fix} recenterAtBottom/></View>}
    <View pointerEvents="box-none" style={{flex:1,padding:32,paddingTop:40,gap:12,justifyContent:focus?'center':'flex-end'}}>
      {focus&&<Text weight="bold" style={{color:'#FFFFFF',fontSize:28,textAlign:'center'}}>러닝을 준비하고 있어요</Text>}
      {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={{padding:16,borderRadius:20,backgroundColor:c.surface,gap:8}}>
        <Text weight="bold">{course?.name??'코스 확인 중…'}</Text><Text testID="run-readiness" variant="caption">{readiness?.message}</Text>
        <Text variant="caption">준비 중에는 기록하지 않아요. {background?'시작 후 화면을 꺼도 기록해요.':'화면을 끄면 일시정지해요.'}</Text>
        {readiness?.distanceM!==null&&(readiness?.distanceM??0)>12&&<RunButton id="run-prepare-path" title={planning?'합류 경로 준비 중 · 취소':'보행 도로 합류 경로 준비'} disabled={busy} onPress={()=>planning?planController.current?.abort():void preparePath()}/>}
        {!!error&&<RunButton id="run-locate" title="현재 위치 다시 확인" disabled={busy} onPress={()=>void locate()}/>}
      </View>
    </View>
    <ModeSwitch focus={focus} onChange={()=>setFocus(!focus)}/>
    <RunningControls busy={busy||planning} paused preparation canStart={!!readiness?.ready} onSettings={()=>router.push('/run-settings')} onStartPause={onStart} onFinish={finish}/>
    <AppModal icon={<Image source={require('../../../assets/generation/run.svg')} tintColor="#FC5602" style={{width:22,height:22}}/>} visible={notice} title="코스 근처로 이동해 주세요" onClose={()=>setNotice(false)} footer={<Button testID="run-preparation-confirm" compact variant="outline" label="확인" onPress={()=>setNotice(false)}/>}><Text style={{textAlign:'center'}}>현재 위치가 코스 경로 근처에 있어야 러닝을 시작할 수 있어요. 코스 위로 이동하거나 보행 도로 합류 경로를 준비해 주세요.</Text></AppModal>
  </View>;
}
