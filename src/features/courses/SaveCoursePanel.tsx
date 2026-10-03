import { Link } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LabCalculation } from '../route-lab/session';
import { courseFromCalculation } from '../route-lab/saved-course';
import { COURSE_NAME_MAX, courseErrorMessage, courseShapes, encodeSnapshot, type CourseSnapshot } from '@/modules/courses/model';
import { getStorage } from '@/modules/storage/database';

export default function SaveCoursePanel({ completed, selected }: { completed: LabCalculation; selected: number }) {
  const draft = useMemo(() => {
    try { return { value: encodeSnapshot(courseFromCalculation(completed, selected)), error: '' }; }
    catch (error) { return { value: null, error: courseErrorMessage(error) }; }
  }, [completed, selected]);
  return draft.value ? <CourseEditor key={draft.value.hash} snapshot={draft.value.snapshot} selected={selected} />
    : <Text accessibilityRole="alert" style={styles.small}>{draft.error}</Text>;
}

function CourseEditor({ snapshot, selected }: { snapshot: CourseSnapshot; selected: number }) {
  const [name, setName] = useState(() => `${courseShapes[snapshot.shape]} ${snapshot.lengthKm.toFixed(2)}km`), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [savedId, setSavedId] = useState<string | null>(null);
  const mounted = useRef(false), inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    const value = snapshot, title = name;
    try {
      const result = await (await getStorage()).courses.save(value, title);
      if (mounted.current) {
        setSavedId(result.id);
        setMessage(result.created ? '이 기기에 코스를 저장했어요.' : '이미 저장한 코스예요. 기존 이름과 경로를 유지했어요.');
      }
    } catch (error) { if (mounted.current) setMessage(courseErrorMessage(error)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <View style={styles.card}>
    <Text style={styles.title}>선택한 {selected + 1}순위 코스 저장</Text>
    <Text style={styles.small}>계산 당시의 {courseShapes[snapshot.shape]} · 목표 {snapshot.targetKm}km를 저장해요. {snapshot.source === 'synthetic' ? '가상 테스트 코스이며 실제 달릴 길이 아니에요.' : '기기에 먼저 저장해요. 개인 기록 동기화를 켜면 내 계정의 서버에도 저장되며 다른 사람에게 공개되지 않아요.'}</Text>
    <TextInput testID="course-save-name" accessibilityLabel="저장할 코스 이름" value={name} onChangeText={setName}
      maxLength={COURSE_NAME_MAX} editable={!busy} style={styles.input} placeholder="코스 이름" />
    <Pressable testID="course-save" accessibilityRole="button" disabled={busy || Platform.OS === 'web'} style={styles.button} onPress={() => void save()}>
      <Text style={styles.buttonText}>{busy ? '저장 중…' : '선택한 코스 저장'}</Text>
    </Pressable>
    {!!message && <Text testID="course-save-notice" accessibilityLiveRegion="polite" style={styles.small}>{message}</Text>}
    {Platform.OS === 'web' && <Text style={styles.small}>코스 저장은 Android 앱에서 확인해 주세요.</Text>}
    {savedId && <Link href={{ pathname: '/courses/[id]', params: { id: savedId } }} style={styles.link}>저장한 코스 열기</Link>}
    <Link href="/courses" style={styles.link}>저장한 코스 목록</Link>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, backgroundColor: '#FFFFFF', gap: 12 },
  title: { fontSize: 17, color: '#183C32', fontWeight: '600' }, small: { color: '#57675F', lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#8B9C90', padding: 12, borderRadius: 10, color: '#183C32' },
  button: { padding: 14, backgroundColor: '#183C32', borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '600' }, link: { color: '#23694C', paddingVertical: 6 },
});
