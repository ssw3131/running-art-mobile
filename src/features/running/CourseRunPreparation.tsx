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
import { RunButton, styles } from './ui';

export default function CourseRunPreparation({ id, busy, onStart }: { id: string; busy: boolean; onStart(): void }) {
  const [course, setCourse] = useState<RunCourse | null>(null), [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState(''), [now, setNow] = useState(0);
  const generation = useRef(0), subscription = useRef<Location.LocationSubscription | null>(null), locating = useRef(false);
  const locate = useCallback(async () => {
    if (locating.current) return;
    locating.current = true;
    const ticket = ++generation.current; subscription.current?.remove(); subscription.current = null; setError(''); setFix(null);
    try {
      const saved = await (await getStorage()).courses.get(id);
      const c = validateRunCourse({ id: saved.id, name: saved.name, snapshot: saved.snapshot });
      if (ticket !== generation.current) return;
      setCourse(c);
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
      if (value === 'background' && !locating.current) { generation.current++; subscription.current?.remove(); subscription.current = null; setFix(null); }
      if (value === 'active' && !subscription.current) void locate();
    });
    return () => { generation.current++; subscription.current?.remove(); subscription.current = null; clearInterval(timer); state.remove(); };
  }, [locate]));
  const readiness = course ? startReadiness(course, fix, now) : null;
  const preview = course ? createGuidance(course.snapshot.route).snapshot() : null;
  if (preview && fix) preview.position = [fix.longitude, fix.latitude];
  return <View style={{ gap: 12 }}>
    <Text style={styles.title}>코스 러닝 준비</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {course && preview && <>
      <Text style={styles.body}>{course.name} · {course.snapshot.lengthKm.toFixed(2)} km</Text>
      <View style={{ height: 300, borderRadius: 16, overflow: 'hidden' }}><GuidanceMap route={course.snapshot.route} state={preview} positionLabel="현재 위치로 지도 이동" showPosition={!!fix} /></View>
      <Text style={styles.body}>갈색 점이 코스 출발점이에요. 출발점 부근에서 정방향으로 시작합니다.</Text>
      <Text testID="run-readiness" style={styles.body}>{readiness?.message}</Text>
      {fix && <Text style={styles.body}>현재 위치 정확도 ±{Math.round(fix.accuracy ?? 0)}m</Text>}
      <Text style={styles.body}>준비 중에는 기록하지 않아요. 시작 후에는 화면을 꺼도 안내와 GPS 기록이 이어집니다.</Text>
      <RunButton id="run-course-start" title="이 코스로 러닝 시작" disabled={busy || !readiness?.ready} onPress={onStart} />
    </>}
    <RunButton id="run-locate" title="현재 위치 다시 확인" disabled={busy} onPress={() => void locate()} />
  </View>;
}
