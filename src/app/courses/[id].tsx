import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStorage } from '@/modules/storage/database';
import { COURSE_NAME_MAX, CourseError, courseErrorMessage, courseShapes, savedCourseOverlay, type SavedCourse } from '@/modules/courses/model';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import { shareCourseGpx } from '@/modules/courses/share-gpx';
import { exportErrorMessage } from '@/modules/courses/export';
import SimulationPanel from '@/features/courses/SimulationPanel';

const styleUrl = mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY);
const emptyRoads = { type: 'FeatureCollection' as const, features: [] };
export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), router = useRouter();
  const [course, setCourse] = useState<SavedCourse | null>(null), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [canDelete, setCanDelete] = useState(false), [background, setBackground] = useState(false);
  const [simulation, setSimulation] = useState(false);
  const generation = useRef(0), inFlight = useRef(false);
  const exportController = useRef<AbortController | null>(null);
  const overlay = useMemo(() => course ? savedCourseOverlay(course.snapshot) : null, [course]);
  const supported = Platform.OS !== 'web';
  const refresh = useCallback(async () => {
    const request = ++generation.current; setBusy(true); setError(''); setNotice(''); setCourse(null); setCanDelete(false); setBackground(false); setSimulation(false);
    try {
      const loaded = await (await getStorage()).courses.get(id);
      if (request === generation.current) { setCourse(loaded); setName(loaded.name); setCanDelete(true); }
    } catch (cause) {
      if (request === generation.current) {
        setError(courseErrorMessage(cause));
        setCanDelete(cause instanceof CourseError && (cause.code === 'corrupt' || cause.code === 'newer-format'));
      }
    } finally { if (request === generation.current) setBusy(false); }
  }, [id]);
  useFocusEffect(useCallback(() => {
    if (supported) void refresh();
    return () => { generation.current++; exportController.current?.abort(); };
  }, [refresh, supported]));
  async function rename() {
    if (inFlight.current || !course) return;
    inFlight.current = true; const request = generation.current;
    setBusy(true); setError(''); setNotice('');
    let committed = false;
    try {
      const repository = (await getStorage()).courses;
      await repository.rename(id, name); committed = true;
      const loaded = await repository.get(id);
      if (request === generation.current) { setCourse(loaded); setName(loaded.name); setNotice('코스 이름을 바꿨어요.'); }
    } catch (cause) {
      if (request === generation.current) setError(committed ? '이름은 저장했지만 다시 읽지 못했어요. 새로고침해 주세요.' : courseErrorMessage(cause));
    } finally { inFlight.current = false; if (request === generation.current) setBusy(false); }
  }
  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true; const request = generation.current; setBusy(true); setError('');
    try {
      await (await getStorage()).courses.remove(id);
      if (request === generation.current) router.replace('/courses');
    } catch (cause) { if (request === generation.current) setError(courseErrorMessage(cause)); }
    finally { inFlight.current = false; if (request === generation.current) setBusy(false); }
  }
  async function exportGpx() {
    if (inFlight.current || !course) return;
    inFlight.current = true; const request = generation.current;
    const controller = new AbortController(); exportController.current = controller;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await shareCourseGpx(id, controller.signal);
      if (request === generation.current && result === 'closed') {
        setNotice('공유 창을 닫았어요. 파일 저장 여부는 선택한 앱에서 확인해 주세요.');
      }
    } catch (cause) {
      if (request === generation.current) setError(exportErrorMessage(cause));
    } finally {
      inFlight.current = false; exportController.current = null;
      if (request === generation.current) setBusy(false);
    }
  }
  return <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {!supported && <Text>저장한 코스는 Android 앱에서 확인해 주세요.</Text>}
      {busy && <ActivityIndicator color="#183C32" />}
      {!!error && <Text testID="course-detail-error" accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!notice && <Text testID="course-detail-notice" accessibilityLiveRegion="polite">{notice}</Text>}
      {course && <>
        <Text testID="course-title" style={styles.title}>{course.name}</Text>
        <Text style={styles.description}>{courseShapes[course.shape]} · {course.lengthKm.toFixed(2)}km · {course.score}점</Text>
        <Text style={styles.description}>목표 {course.targetKm}km · 계산 버전 {course.snapshot.engineVersion}</Text>
        <Text style={styles.description}>{course.source === 'synthetic' ? '가상 테스트 코스 · 실제 달릴 길이 아니에요.' : '저장한 OSM 도로 코스예요.'} 경로를 다시 계산하지 않고 저장 자료를 표시해요.</Text>
        {!simulation && <><View style={styles.map}><MapSurface styleUrl={background ? styleUrl ?? '' : ''} position={null} origin={course.snapshot.origin}
          routeOverlay={overlay} syntheticRoads={background ? undefined : emptyRoads} /></View>
        <Text style={styles.small}>초록 실선: 저장 경로 · 갈색 점선: 목표 도형 · 점: 출발/도착</Text>
        <Text style={styles.small}>{background ? '배경 지도는 인터넷 연결이 필요해요.' : '배경 지도 없이 저장 경로만 표시해요. 인터넷·GPS가 필요하지 않아요.'}</Text>
        {course.source === 'osm' && styleUrl && <Pressable accessibilityRole="button" testID="course-map-toggle" style={styles.button} onPress={() => setBackground(value => !value)}>
          <Text>{background ? '배경 지도 끄기 · 경로만 보기' : '배경 지도 보기 · 인터넷 사용'}</Text>
        </Pressable>}
        {background && <View style={styles.credits}><Image source={require('@/assets/images/maptiler-logo.png')} style={styles.logo} resizeMode="contain" />
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.maptiler.com/copyright/').catch(() => {})}><Text style={styles.small}>© MapTiler</Text></Pressable></View>}
        </>}
        {course.source === 'osm' && <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}><Text style={styles.small}>© OpenStreetMap contributors · ODbL</Text></Pressable>}
        <Text style={styles.small}>계산 기준 {course.snapshot.origin.lat.toFixed(5)}, {course.snapshot.origin.lng.toFixed(5)}</Text>
        <Text style={styles.small}>실제 코스 출발점 {course.snapshot.route[0][1].toFixed(5)}, {course.snapshot.route[0][0].toFixed(5)} · 정방향으로 달리는 코스예요.</Text>
        {course.source === 'osm' && <Link href={{ pathname: '/run', params: { courseId: course.id } }} asChild><Pressable testID="course-run" accessibilityRole="button" style={styles.button}><Text>이 코스로 러닝 준비</Text></Pressable></Link>}
        <Text style={styles.small}>저장 {new Date(course.createdAt).toLocaleString('ko-KR')} · 점수는 후보 비교용이며 일치율이 아니에요.</Text>
        <Pressable testID="course-simulation-toggle" accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => { setBackground(false); setSimulation(value => !value); }}><Text>{simulation ? '시뮬레이션 닫기' : '코스 시뮬레이션 시작'}</Text></Pressable>
        {simulation && <SimulationPanel key={`${course.id}-${course.updatedAt}`} snapshot={course.snapshot} />}
        <Link href={{ pathname: '/guidance', params: { courseId: course.id } }} asChild>
          <Pressable testID="course-guidance" accessibilityRole="button" style={styles.button}><Text>러닝 안내 시험 · 모의 주행</Text></Pressable>
        </Link>
        <Pressable testID="course-export-gpx" accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void exportGpx()}>
          <Text>GPX 내보내기</Text>
        </Pressable>
        <Text style={styles.small}>저장된 이름과 경로를 GPX 파일로 공유해요. 실제 러닝 기록은 포함하지 않아요. 파일에 출발 위치와 전체 경로가 들어가요.</Text>
        <TextInput testID="course-rename-input" accessibilityLabel="코스 이름 변경" style={styles.input} value={name} onChangeText={setName} maxLength={COURSE_NAME_MAX} editable={!busy} />
        <Pressable testID="course-rename" accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void rename()}><Text>이름 변경 저장</Text></Pressable>
      </>}
      {supported && <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void refresh()}><Text>다시 읽기</Text></Pressable>}
      {canDelete && <Pressable testID="course-delete" accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => Alert.alert('코스를 삭제할까요?', '코스가 기기에서 삭제됩니다. 계정에 연결한 코스는 다음 동기화 때 서버와 다른 기기에서도 삭제됩니다. 삭제한 코스는 복원할 수 없어요.', [
        { text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void remove() },
      ])}><Text style={styles.error}>코스 삭제</Text></Pressable>}
      <Link href="/courses" style={styles.link}>저장한 코스 목록</Link>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F6F5F0' }, content: { padding: 20, gap: 14 },
  title: { fontSize: 26, fontWeight: '700', color: '#183C32' }, description: { color: '#57675F', fontSize: 15, lineHeight: 23 },
  small: { color: '#57675F', fontSize: 12, lineHeight: 19 }, map: { height: 300, borderRadius: 12, overflow: 'hidden' },
  button: { padding: 14, borderRadius: 10, backgroundColor: '#E8EDE7', alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#8B9C90', padding: 14, borderRadius: 10, color: '#183C32' },
  error: { color: '#A12F2F', lineHeight: 22 }, link: { color: '#23694C', padding: 10 },
  credits: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logo: { width: 60, height: 16 },
});
