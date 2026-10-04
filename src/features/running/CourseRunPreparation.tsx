import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { AppState, Text, View } from 'react-native';
import { getStorage } from '@/modules/storage/database';
import { courseErrorMessage } from '@/modules/courses/model';
import { createGuidance } from '@/modules/guidance/engine';
import GuidanceMap from '@/features/guidance/GuidanceMap';
import { startReadiness, validateRunCourse, type RunCourse } from '@/modules/running/guidance';
import type { Fix } from '@/modules/running/model';
import { defaultAccountPreferences } from '@/modules/account/model';
import { planApproach } from '@/modules/running/navigation';
import type { ApproachPlan } from '@/modules/running/approach';
import { RunButton, styles } from './ui';

export default function CourseRunPreparation({ id, busy, onStart }: { id: string; busy: boolean; onStart(): void }) {
  const [course, setCourse] = useState<RunCourse | null>(null), [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState(''), [now, setNow] = useState(0);
  const [plan,setPlan]=useState<ApproachPlan|null>(null),[planning,setPlanning]=useState(false);
  const planController=useRef<AbortController|null>(null);
  const [background, setBackground] = useState(defaultAccountPreferences.guidance.background);
  const generation = useRef(0), subscription = useRef<Location.LocationSubscription | null>(null), locating = useRef(false);
  const locate = useCallback(async () => {
    if (locating.current) return;
    locating.current = true;
    const ticket = ++generation.current; subscription.current?.remove(); subscription.current = null; planController.current?.abort(); setPlan(null); setError(''); setFix(null);
    try {
      const saved = await (await getStorage()).courses.get(id);
      const preferences = await (await getStorage()).account.preferences();
      const c = validateRunCourse({ id: saved.id, name: saved.name, snapshot: saved.snapshot });
      if (ticket !== generation.current) return;
      setCourse(c);
      setBackground(preferences.guidance.background);
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
    } finally { locating.current = false; }
  }, [id]);
  useFocusEffect(useCallback(() => {
    void locate();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const state = AppState.addEventListener('change', value => {
      if (value === 'background' && !locating.current) { generation.current++; planController.current?.abort(); subscription.current?.remove(); subscription.current = null; setFix(null); }
      if (value === 'active' && !subscription.current) void locate();
    });
    return () => { generation.current++; planController.current?.abort(); subscription.current?.remove(); subscription.current = null; clearInterval(timer); state.remove(); };
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
  return <View style={{ gap: 12 }}>
    <Text style={styles.title}>코스 러닝 준비</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {course && preview && <>
      <Text style={styles.body}>{course.name} · {course.snapshot.lengthKm.toFixed(2)} km</Text>
      <View style={{ height: 300, borderRadius: 16, overflow: 'hidden' }}><GuidanceMap route={course.snapshot.route} state={preview} positionLabel="현재 위치로 지도 이동" showPosition={!!fix} /></View>
      <Text style={styles.body}>코스 어느 지점에서든 원하는 방향으로 출발할 수 있어요. 한 방향으로 한 바퀴 돌아오면 완주해요.</Text>
      <Text testID="run-readiness" style={styles.body}>{readiness?.message}</Text>
      {fix && <Text style={styles.body}>현재 위치 정확도 ±{Math.round(fix.accuracy ?? 0)}m</Text>}
      <Text style={styles.body}>준비 중에는 기록하지 않아요. 시작 버튼 이후 접근 거리·시간도 기록하며, 코스 진행률은 합류 후부터 계산해요. {background ? '화면을 꺼도 안내와 GPS 기록이 이어집니다.' : '앱을 벗어나거나 화면을 끄면 일시정지됩니다.'}</Text>
      {readiness?.distanceM!==null && (readiness?.distanceM??0)>12 && <RunButton id="run-prepare-path" title={planning?'합류 경로 준비 중 · 취소':'보행 도로 합류 경로 준비'} disabled={busy} onPress={()=>planning?planController.current?.abort():void preparePath()} />}
      <RunButton id="run-course-start" title="이 코스로 러닝 시작" disabled={busy || planning || !readiness?.ready} onPress={onStart} />
    </>}
    <RunButton id="run-locate" title="현재 위치 다시 확인" disabled={busy} onPress={() => void locate()} />
  </View>;
}
