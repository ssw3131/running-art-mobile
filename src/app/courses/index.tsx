import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStorage } from '@/modules/storage/database';
import { courseErrorMessage, courseShapes, type CourseSummary } from '@/modules/courses/model';

const PAGE = 30;
export default function CoursesScreen() {
  const [rows, setRows] = useState<CourseSummary[]>([]), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [more, setMore] = useState(false);
  const generation = useRef(0), loading = useRef(false);
  const supported = Platform.OS !== 'web';
  const refresh = useCallback(async () => {
    const request = ++generation.current; loading.current = true; setBusy(true); setError(''); setReady(false);
    try {
      const items = await (await getStorage()).courses.list(PAGE + 1);
      if (generation.current === request) { setRows(items.slice(0, PAGE)); setMore(items.length > PAGE); setReady(true); }
    } catch (cause) { if (generation.current === request) setError(courseErrorMessage(cause)); }
    finally { if (generation.current === request) { loading.current = false; setBusy(false); } }
  }, []);
  useFocusEffect(useCallback(() => {
    if (supported) void refresh();
    return () => { generation.current++; loading.current = false; };
  }, [refresh, supported]));
  async function loadMore() {
    if (loading.current) return;
    const request = generation.current; loading.current = true; setBusy(true); setError('');
    try {
      const items = await (await getStorage()).courses.list(PAGE + 1, rows.length);
      if (generation.current === request) { setRows(previous => [...previous, ...items.slice(0, PAGE)]); setMore(items.length > PAGE); }
    } catch (cause) { if (generation.current === request) setError(courseErrorMessage(cause)); }
    finally { if (generation.current === request) { loading.current = false; setBusy(false); } }
  }
  return <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>저장한 코스</Text>
      <Text style={styles.description}>저장한 코스를 다시 열 수 있어요. 계정에 연결한 코스는 같은 계정에서 표시됩니다. 내 계정에서 동기화를 켜면 서버에 저장하고 다른 기기에서 복원할 수 있어요.</Text>
      {!supported ? <Text>저장한 코스는 Android 앱에서 확인해 주세요.</Text> : <>
        {busy && <ActivityIndicator color="#183C32" />}
        {!!error && <Text accessibilityRole="alert" testID="courses-error" style={styles.error}>{error}</Text>}
        <Pressable testID="courses-refresh" accessibilityRole="button" disabled={busy} onPress={() => void refresh()} style={styles.button}><Text>목록 새로고침</Text></Pressable>
        {ready && rows.length === 0 && <Text testID="courses-empty" style={styles.description}>아직 저장한 코스가 없어요. 계산 결과에서 원하는 후보를 저장해 보세요.</Text>}
        {ready && rows.map(course => <Link key={course.id} href={{ pathname: '/courses/[id]', params: { id: course.id } }} asChild>
          <Pressable testID={`course-row-${course.id}`} accessibilityRole="button" style={styles.card}>
            <Text style={styles.name}>{course.name}</Text>
            <Text style={styles.description}>{courseShapes[course.shape] ?? '코스'} · {course.lengthKm.toFixed(2)}km · {course.score}점</Text>
            <Text style={styles.description}>{course.source === 'synthetic' ? '가상 테스트 코스 · 실제 길 아님' : 'OSM 도로 코스'} · 저장 {new Date(course.createdAt).toLocaleString('ko-KR')}</Text>
          </Pressable>
        </Link>)}
        {ready && more && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void loadMore()} style={styles.button}><Text>더 보기</Text></Pressable>}
      </>}
      <Link href="/route-lab" style={styles.link}>새 코스 계산하기</Link>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F6F5F0' }, content: { padding: 20, gap: 16 },
  title: { fontSize: 26, fontWeight: '700', color: '#183C32' }, name: { fontSize: 19, fontWeight: '600', color: '#183C32' },
  description: { color: '#57675F', lineHeight: 22 }, card: { padding: 18, gap: 10, borderRadius: 14, backgroundColor: '#FFFFFF' },
  button: { padding: 14, borderRadius: 10, backgroundColor: '#E8EDE7', alignItems: 'center' },
  link: { color: '#23694C', padding: 10 }, error: { color: '#A12F2F', lineHeight: 22 },
});
