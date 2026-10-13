import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { fonts } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeProvider';
import { shareCourseGpx } from '@/modules/courses/share-gpx';
import { exportErrorMessage } from '@/modules/courses/export';
import { openServiceTab } from '@/features/service/open-service-tab';
import type { LabCalculation } from '../route-lab/session';
import { courseFromCalculation } from '../route-lab/saved-course';
import { COURSE_NAME_MAX, courseErrorMessage, courseShapes, encodeSnapshot, type CourseSnapshot } from '@/modules/courses/model';
import { getStorage } from '@/modules/storage/database';
import { authentication } from '@/modules/auth/runtime';
import { GenerationIcon } from '@/features/course-generation/GenerationIcon';

export default function SaveCoursePanel({ completed, selected }: { completed: LabCalculation; selected: number }) {
  const draft = useMemo(() => {
    try { return { value: encodeSnapshot(courseFromCalculation(completed, selected)), error: '' }; }
    catch (error) { return { value: null, error: courseErrorMessage(error) }; }
  }, [completed, selected]);
  return draft.value ? <CourseEditor key={draft.value.hash} snapshot={draft.value.snapshot} selected={selected} />
    : <AppText accessibilityRole="alert">{draft.error}</AppText>;
}

export function CourseEditor({ snapshot, selected, initialName, initialSavedId, onDraftChange, scrollRef }: { snapshot: CourseSnapshot; selected: number; initialName?: string; initialSavedId?: string | null; onDraftChange?(value: { name?: string; savedId?: string }): void; scrollRef?: RefObject<ScrollView | null> }) {
  const c = useThemeColors();
  const exportController = useRef<AbortController | null>(null);
  const [name, setName] = useState(() => initialName ?? `${courseShapes[snapshot.shape]} ${snapshot.lengthKm.toFixed(2)}km`), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [savedId, setSavedId] = useState<string | null>(initialSavedId ?? null);
  const mounted = useRef(false), inFlight = useRef(false);
  const nameInput = useRef<TextInput>(null);
  const revealName = useCallback(() => {
    if (!nameInput.current?.isFocused()) return;
    scrollRef?.current?.getNativeScrollRef()?.measureInWindow((_x, y) => {
      if (nameInput.current?.isFocused()) scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(nameInput.current, y + 16, true);
    });
  }, [scrollRef]);
  useEffect(() => {
    const listener = Keyboard.addListener('keyboardDidShow', revealName);
    return () => listener.remove();
  }, [revealName]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; exportController.current?.abort(); }; }, []);
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage(''); Keyboard.dismiss();
    const value = snapshot, title = name, owner = authentication.getSnapshot().account?.id ?? null;
    try {
      const storage = await getStorage();
      if (!mounted.current) return;
      if (owner !== (authentication.getSnapshot().account?.id ?? null)) {
        setMessage('계정이 바뀌었어요. 현재 계정에서 코스를 다시 선택해 주세요.'); return;
      }
      const result = await storage.courses.save(value, title);
      onDraftChange?.({ savedId: result.id, name: title });
      if (mounted.current) {
        setSavedId(result.id);
        setMessage(result.created ? '이 기기에 코스를 저장했어요.' : '이미 저장한 코스예요. 기존 이름과 경로를 유지했어요.');
      }
    } catch (error) { if (mounted.current) setMessage(courseErrorMessage(error)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  async function exportGpx() {
    if (!savedId || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    const controller = new AbortController(); exportController.current = controller;
    try {
      const result = await shareCourseGpx(savedId, controller.signal);
      if (mounted.current && result === 'closed') setMessage('공유 창을 닫았어요. 파일 저장 여부는 선택한 앱에서 확인해 주세요.');
    } catch (error) { if (mounted.current) setMessage(exportErrorMessage(error)); }
    finally { inFlight.current = false; exportController.current = null; if (mounted.current) setBusy(false); }
  }
  return <View style={{ gap: 16, paddingBottom: 12 }}>
    <AppText weight="bold">선택한 {selected + 1}순위 코스 저장</AppText>
    <AppText variant="caption" style={{ color: c.muted }}>계산 당시의 {courseShapes[snapshot.shape]} · 목표 {snapshot.targetKm}km를 저장해요. {snapshot.source === 'synthetic' ? '가상 테스트 코스이며 실제 달릴 길이 아니에요.' : '기기에 먼저 저장해요. 개인 기록 동기화를 켜면 내 계정에 동기화해요.'}</AppText>
    <AppText variant="label">코스 이름</AppText>
    <TextInput ref={nameInput} onFocus={() => { if (Keyboard.isVisible()) revealName(); }} testID="course-save-name" accessibilityLabel="저장할 코스 이름" value={name}
      onChangeText={value => { setName(value); onDraftChange?.({ name: value }); }} maxLength={COURSE_NAME_MAX} editable={!busy}
      style={{ minHeight: 50, padding: 14, borderWidth: 1, borderRadius: 8, borderColor: c.border, color: c.text, fontFamily: fonts.noto.regular, fontSize: 16 }} placeholder="코스 이름" />
    <Button testID="course-save" label={busy ? '처리 중…' : '코스 보관함에 저장하기'} variant="secondary" disabled={busy || Platform.OS === 'web'} onPress={() => void save()} />
    {!!message && <AppText testID="course-save-notice" accessibilityLiveRegion="polite" variant="label">{message}</AppText>}
    {!savedId && <AppText variant="caption" style={{ color: c.muted }}>코스를 저장하면 GPX 내보내기와 러닝 준비를 이용할 수 있어요.</AppText>}
    {Platform.OS === 'web' && <AppText>코스 저장은 Android 앱에서 확인해 주세요.</AppText>}
    <Button testID="candidate-export" label="GPX 파일 내보내기" variant="secondary" disabled={!savedId || busy} onPress={() => void exportGpx()} />
    {savedId && <Link href={{ pathname: '/courses/[id]', params: { id: savedId } }} style={{ color: c.selected, paddingVertical: 12 }}>저장한 코스 열기</Link>}
    {snapshot.source === 'osm' && <Button testID="saved-course-run" label="이 코스로 러닝 준비" leading={<GenerationIcon name="run" />} disabled={!savedId || busy}
      onPress={() => { if (savedId) openServiceTab({ pathname: '/run', params: { courseId: savedId } }); }} />}
    <Button testID="generation-saved-list" label="저장한 코스 목록" variant="outline"
      onPress={() => openServiceTab({ pathname: '/courses', params: { view: 'courses' } })} />
  </View>;
}
