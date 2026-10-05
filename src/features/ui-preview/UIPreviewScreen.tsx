import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, ConfirmDialog, Divider, Icon, IconButton, SelectField, Surface, Tabs, TextField } from '@/components/ui';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { TopBar } from '@/components/navigation/TopBar';
import { colors, radius, space } from '@/theme/tokens';

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return <Surface style={{ paddingHorizontal: 0 }}><AppText variant="heading" weight="bold">{title}</AppText>{children}</Surface>;
}

export function UIPreviewScreen({ onBack }: { onBack(): void }) {
  const inset = useSafeAreaInsets();
  const [name, setName] = useState(''); const [tab, setTab] = useState('condition'); const [nav, setNav] = useState('home');
  const [selection, setSelection] = useState<string | null>(null); const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('버튼을 눌러 상태를 확인하세요.');
  const [confirmationCount, setConfirmationCount] = useState(0);
  const dialogTrigger = useRef<View>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const confirm = () => { setConfirmationCount(n => n + 1); setBusy(true); timer.current = setTimeout(() => { setBusy(false); setDialog(false); setMessage('미리보기 확인 완료'); }, 1500); };
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background, paddingTop: inset.top }}>
    <TopBar title="공통 UI" leading={<Button compact variant="outline" label="뒤로" onPress={onBack} />} />
    <ScrollView testID="ui-preview-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 26, paddingBottom: 32, maxWidth: 540, width: '100%', alignSelf: 'center' }}>
      <AppText variant="caption" style={{ color: colors.subtle }}>RunPen · 라이트 스타일 미리보기</AppText>
      <AppText variant="caption" style={{ color: colors.subtle }}>입력과 선택은 이 화면 안에서만 유지됩니다.</AppText>
      <Section title="글꼴">
        <AppText variant="title" weight="bold">오늘도 나만의 코스를 그려요</AppText>
        <AppText>Noto Sans KR · RunPen 2026 · 5.24 km</AppText>
        <AppText weight="medium">중간 굵기 · 한글과 English 123</AppText>
        <AppText weight="semibold">세미볼드 · 한글과 English 123</AppText>
        <AppText weight="bold">굵게 · 한글과 English 123</AppText>
        <AppText variant="caption">Roboto 명시 지정 예시</AppText>
        <AppText family="roboto" variant="metric" weight="bold">5.24 km</AppText>
        <AppText>혼용 예시: <AppText family="roboto" weight="medium">00:32:18</AppText> 달렸어요</AppText>
        <AppText variant="caption">실제 화면별 Roboto 적용 위치는 최신 Figma 대조 후 확정합니다.</AppText>
      </Section>
      <Divider />
      <Section title="색상·간격·모서리">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {(['action', 'selected', 'navigation', 'secondary', 'border', 'text'] as const).map(key => <View key={key} style={{ width: 96, gap: 4 }}>
            <View style={{ height: 40, borderRadius: radius.field, backgroundColor: colors[key] }} />
            <AppText variant="caption">{key}</AppText><AppText variant="caption">{colors[key]}</AppText>
          </View>)}
        </View>
        <AppText variant="caption">간격 {Object.values(space).join(' / ')} · 모서리 8 / 10 / 20 / 28 / 30</AppText>
      </Section>
      <Divider />
      <Section title="버튼">
        <Button label="코스 설정" leading={<Icon name="share" />} trailing={<Icon name="chevronRight" />} onPress={() => setMessage('코스 설정 버튼 선택')} testID="preview-primary" />
        <Button label="저장하고 종료하기" variant="secondary" onPress={() => setMessage('보조 버튼 선택')} />
        <Button label="홈으로" variant="outline" onPress={() => setMessage('외곽선 버튼 선택')} />
        <Button label="비활성 버튼" disabled onPress={() => setMessage('오류: 비활성 버튼 실행')} />
        <Button label="처리 중" loading onPress={() => setMessage('오류: 처리 중 버튼 실행')} />
        <View style={{ flexDirection: 'row', gap: 8 }}><IconButton label="보관함 아이콘 버튼" onPress={() => setMessage('아이콘 버튼 선택')}><Icon name="archive" /></IconButton></View>
        <AppText testID="preview-feedback" variant="caption" accessibilityLiveRegion="polite">{message}</AppText>
      </Section>
      <Divider />
      <Section title="입력·선택">
        <TextField label="코스 이름" placeholder="이름을 입력해주세요." value={name} onChangeText={setName} testID="preview-name" hint="한글·영문·숫자 입력을 확인하세요." />
        <TextField label="오류 상태" value="" onChangeText={() => undefined} placeholder="필수 입력" error="코스 이름을 입력해주세요." />
        <TextField label="비활성 입력" value="RunPen 2026" onChangeText={() => undefined} editable={false} />
        <SelectField label="목표 거리" value={selection} onChange={setSelection} options={[{ value: '3', label: '3 km' }, { value: '5', label: '5 km' }, { value: '10', label: '10 km' }, { value: '20', label: '20 km (준비 중)', disabled: true }]} testID="preview-select" />
      </Section>
      <Divider />
      <Section title="탭">
        <Tabs value={tab} onChange={setTab} options={[{ value: 'condition', label: '조건 설정' }, { value: 'recommend', label: '추천 코스' }]} />
        <AppText variant="caption">{tab === 'condition' ? '조건 설정 내용' : '추천 코스 내용'}</AppText>
      </Section>
      <Section title="확인 모달">
        <Button ref={dialogTrigger} label="모달 열기" onPress={() => setDialog(true)} testID="preview-open-dialog" />
        <AppText testID="preview-confirm-count" variant="caption" accessibilityLiveRegion="polite">확인 실행 {confirmationCount}회</AppText>
        <AppText variant="caption">뒤로 가기로 닫기 · 확인 중 중복 실행 방지 · 글꼴 확대 시 스크롤</AppText>
      </Section>
      <Section title="원본 대조 대기">
        <AppText variant="caption">체크박스·스위치 선택 상태와 상단 바 아이콘은 Figma 호출 한도로 원본 에셋을 아직 확보하지 못했습니다.</AppText>
      </Section>
    </ScrollView>
    <BottomTabBar value={nav} onChange={setNav} bottomInset={inset.bottom} />
    <ConfirmDialog visible={dialog} title="미리보기를 확인할까요?" description={'확인을 누르면 잠시 처리 중 상태가 표시돼요.\n실제 계정이나 기록은 변경하지 않아요.'} busy={busy} onConfirm={confirm} onCancel={() => setDialog(false)} returnFocusRef={dialogTrigger} />
  </KeyboardAvoidingView>;
}
