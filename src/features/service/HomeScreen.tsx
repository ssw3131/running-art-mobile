import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { homeKind, homePathSvg, type HomeActive, type HomeData, type HomePath } from '@/modules/home/model';
import { durationLabel, statusLabel } from '@/modules/running/model';
import { useThemeColors } from '@/theme/ThemeProvider';
import { radius, size, space } from '@/theme/tokens';
import { useHome } from './use-home';

const shapeAssets = {
  heart: { source: require('../../../assets/home/heart.svg'), width: 49.0004, height: 42.0002, name: '하트' },
  fish: { source: require('../../../assets/home/fish.svg'), width: 52.9996, height: 45.9984, name: '물고기' },
  dog: { source: require('../../../assets/home/dog.svg'), width: 52.9995, height: 45.9979, name: '강아지' },
};
const km = (distance: number) => (distance / 1000).toFixed(1);
const date = (at: number) => { const d = new Date(at); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const openRuns = () => router.navigate({ pathname: '/courses', params: { view: 'runs' } });
const openCourses = () => router.navigate({ pathname: '/courses', params: { view: 'courses' } });

function PathPreview({ paths, label, large = false }: { paths: HomePath[]; label: string; large?: boolean }) {
  const c = useThemeColors(), uri = useMemo(() => homePathSvg(paths, c.selected), [paths, c.selected]);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  return <View accessible accessibilityLabel={label} style={[styles.preview, { backgroundColor: c.navigation, aspectRatio: large ? 1.5 : 1 }]}>
    {uri && uri !== failedUri ? <Image source={{ uri }} contentFit="contain" style={StyleSheet.absoluteFill} accessible={false} onError={() => setFailedUri(uri)} />
      : <AppText variant="caption" style={{ color: c.muted, textAlign: 'center', padding: 12 }}>{uri ? '경로 미리보기를 표시하지 못했어요' : '저장된 경로가 없어요'}</AppText>}
  </View>;
}

function InitialHome({ shape, setShape }: { shape: 'heart' | 'fish'; setShape(value: 'heart' | 'fish'): void }) {
  const c = useThemeColors();
  return <>
    <AppText variant="heading" weight="medium">오늘은 어떤 그림을 달릴까요?</AppText>
    <AppText variant="label" style={{ color: c.muted }}>마음에 드는 모양을 골라보세요.{'\n'}익숙한 길이 나만의 러닝 아트가 됩니다.</AppText>
    <View accessible accessibilityLabel="RunPen, 달린 경로로 만드는 나만의 그림" style={styles.hero}>
      <Image source={require('../../../assets/home/intro.png')} contentFit="fill" accessible={false} style={styles.heroImage} />
    </View>
    <View style={styles.sectionHeading}>
      <AppText weight="bold" style={styles.sectionTitle}>추천 도형 선택</AppText>
      <TextLink label="전체보기" testID="home-all-shapes" onPress={() => router.navigate('/route-lab')} />
    </View>
    <View style={styles.shapes}>
      {(Object.keys(shapeAssets) as (keyof typeof shapeAssets)[]).map(id => {
        const asset = shapeAssets[id], selected = shape === id, unavailable = id === 'dog';
        return <Pressable key={id} testID={`home-shape-${id}`} accessibilityRole="button" accessibilityLabel={`${asset.name}${unavailable ? ', 준비 중' : ''}`}
          accessibilityState={{ selected, disabled: unavailable }} disabled={unavailable} onPress={() => { if (id !== 'dog') setShape(id); }}
          style={[styles.shape, { borderColor: selected ? c.selected : c.outline }]}>
          <View style={{ width: 45, height: 38 }}><Image source={asset.source} accessible={false} contentFit="contain"
            style={{ position: 'absolute', width: asset.width, height: asset.height, left: (45 - asset.width) / 2, top: (38 - asset.height) / 2 }} /></View>
          <AppText weight="bold" style={{ color: selected ? c.selected : c.muted, fontSize: 18 }}>{asset.name}</AppText>
          {unavailable && <AppText variant="caption" style={{ color: c.muted }}>준비 중</AppText>}
        </Pressable>;
      })}
    </View>
  </>;
}

function TextLink({ label, onPress, testID }: { label: string; onPress(): void; testID: string }) {
  const c = useThemeColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} testID={testID} onPress={onPress} style={styles.textLink}>
    <AppText weight="medium" style={{ color: c.subtle, flexShrink: 1 }}>{label}</AppText>
    <Image source={require('../../../assets/home/more.png')} style={{ width: 20, height: 20 }} accessible={false} />
  </Pressable>;
}

function ActiveHome({ active }: { active: HomeActive }) {
  const c = useThemeColors(), { run } = active;
  return <View testID="active-run-banner" style={{ gap: space.lg }}>
    <AppText variant="heading" weight="medium">{run.status === 'running' ? '지금 달리는 길을 확인해 볼까요?' : '오늘은 새로운 길 대신,\n그리던 길을 이어볼까요?'}</AppText>
    <AppText variant="label" style={{ color: c.muted }}>{statusLabel[run.status]} · {run.status === 'running' ? '같은 러닝 기록으로 돌아가요.' : '저장된 지점부터 러닝 화면에서 재개할 수 있어요.'}</AppText>
    <PathPreview paths={active.paths} large label={run.courseId && !active.guidanceError ? '진행 중인 코스 경로' : '저장된 실제 러닝 경로'} />
    <View style={{ gap: space.sm }}>
      <AppText variant="heading" weight="bold">{run.courseName || '자유 러닝'}</AppText>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Image source={require('../../../assets/home/calendar.svg')} style={{ width: 16, height: 16 }} accessible={false} />
        <AppText variant="caption" style={{ color: c.subtle }}>시작 {date(run.startedAt)} · {statusLabel[run.status]}</AppText>
      </View>
    </View>
    <View style={styles.activeMetrics}>
      <View style={{ flex: 1, gap: 4 }}><AppText variant="label" weight="bold" style={{ color: c.subtle }}>달린 거리</AppText>
        <AppText family="roboto" weight="black" variant="metric">{km(run.distanceM)}<AppText weight="black" variant="heading"> km</AppText></AppText>
      </View>
      <View style={{ flex: 1, gap: 4, borderLeftWidth: 1, borderColor: c.divider, paddingLeft: 20 }}>
        <AppText variant="label" weight="bold" style={{ color: c.subtle }}>{active.progress === null ? '활동 시간' : '코스 진행률'}</AppText>
        <AppText family="roboto" weight="black" style={{ fontSize: active.progress === null ? 24 : 36, lineHeight: 44 }}>
          {active.progress === null ? durationLabel(run.activeMs) : `${active.progress}%`}
        </AppText>
      </View>
    </View>
    {active.progress !== null && <>
      <View testID="home-progress" accessibilityRole="progressbar" accessibilityLabel="코스 진행률" accessibilityValue={{ min: 0, max: 100, now: active.progress }}
        style={[styles.progress, { backgroundColor: c.divider }]}><View style={{ height: 19, width: `${active.progress}%`, backgroundColor: '#5197FE', borderRadius: 22 }} /></View>
      <AppText variant="caption" style={{ color: c.muted }}>전체 코스 {km(active.totalM!)} km · 달린 거리는 접근·이탈 이동을 포함해요.</AppText>
    </>}
    {active.guidanceError && <AppText accessibilityRole="alert" variant="label" style={{ color: c.danger }}>코스 진행 정보를 읽지 못했어요. 러닝 화면에서 확인해 주세요.</AppText>}
  </View>;
}

function HistoryHome({ data }: { data: HomeData }) {
  const c = useThemeColors(), latest = data.recent[0];
  return <>
    <AppText variant="heading" weight="medium">오늘도 멋지게 달려요!</AppText>
    <AppText variant="label" style={{ color: c.muted }}>달리는 순간, 더 특별한 하루가 됩니다.</AppText>
    <View style={styles.stats}>
      {[{ label: '최근 러닝 기록', value: km(latest.run.distanceM), detail: date(latest.run.startedAt), icon: require('../../../assets/home/sneaker.svg'), size: 20 },
        { label: '이번 달 달린 거리', value: km(data.monthlyDistanceM), detail: `${new Date(data.monthStart).getMonth() + 1}월 누적`, icon: require('../../../assets/home/trophy.svg'), size: 16 }].map(stat =>
        <View key={stat.label} style={[styles.stat, { backgroundColor: c.navigation }]}>
          <View style={styles.statHeading}><Image source={stat.icon} accessible={false} style={{ width: stat.size, height: stat.size }} /><AppText variant="caption" weight="bold" style={{ color: c.subtle, flexShrink: 1 }}>{stat.label}</AppText></View>
          <AppText family="roboto" weight="black" style={{ fontSize: 24, lineHeight: 30 }}>{stat.value}<AppText variant="caption"> km</AppText></AppText>
          <AppText variant="caption" style={{ color: c.subtle }}>{stat.detail}</AppText>
        </View>)}
    </View>
    <View style={styles.sectionHeading}><AppText weight="bold" style={styles.sectionTitle}>최근 러닝</AppText><TextLink label="더보기" onPress={openRuns} testID="home-more-runs" /></View>
    <View style={styles.recent}>
      {data.recent.map(({ run, paths }) => <Pressable key={run.id} testID={`home-run-${run.id}`} accessibilityRole="button"
        accessibilityLabel={`${run.courseName || '자유 러닝'}, ${km(run.distanceM)} 킬로미터, ${date(run.startedAt)}, 기록 보기`}
        onPress={() => router.push({ pathname: '/runs/[id]', params: { id: run.id } })} style={styles.recentCard}>
        <PathPreview paths={paths} label="실제 러닝 경로" />
        <AppText variant="label" weight="bold">{run.courseName || '자유 러닝'}</AppText>
        <AppText variant="caption" style={{ color: c.subtle }}>{km(run.distanceM)} km · {durationLabel(run.activeMs)}</AppText>
        <AppText variant="caption" style={{ color: c.subtle }}>{date(run.startedAt)}</AppText>
      </Pressable>)}
    </View>
    <AppText variant="caption" style={{ color: c.muted }}>기기 시간대의 시작일 기준 · 저장한 러닝 기록</AppText>
    <Button label="새 코스 만들기" testID="open-route-lab" trailing={<Icon name="chevronRight" />} onPress={() => router.navigate('/route-lab')} />
  </>;
}

export default function HomeScreen() {
  const auth = useAuth(), c = useThemeColors(), { data, error, retry } = useHome();
  const scroll = useRef<ScrollView>(null);
  const [shape, setShape] = useState<'heart' | 'fish'>('heart');
  useFocusEffect(useCallback(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, []));
  const kind = data ? homeKind(data) : null;
  return <View style={{ flex: 1, backgroundColor: c.background }}><ScrollView ref={scroll} testID="service-home" contentContainerStyle={styles.content}>
    <AppText weight="bold" style={styles.greeting}>{auth.account ? `${auth.account.name}님` : '러너님'}</AppText>
    {!data && !error && <View testID="home-loading" accessibilityLabel="홈 기록 확인 중" style={styles.loading}><ActivityIndicator color={c.action} /><AppText>홈 기록을 확인하고 있어요.</AppText></View>}
    {!!error && <View testID="home-error" style={{ gap: space.md }}><AppText accessibilityRole="alert" style={{ color: c.danger }}>{error}</AppText><Button label="홈 다시 확인" testID="home-retry" onPress={retry} /></View>}
    {kind === 'initial' && <View testID="home-initial" style={styles.body}><InitialHome shape={shape} setShape={setShape} /></View>}
    {kind === 'active' && <View testID="home-active"><ActiveHome active={data!.active!} /></View>}
    {kind === 'history' && <View testID="home-history" style={styles.body}><HistoryHome data={data!} /></View>}
    <View style={styles.quickLinks}>
      <TextLink label="저장한 코스" testID="open-courses" onPress={openCourses} />
      <TextLink label="러닝 기록 보기" testID="open-runs" onPress={openRuns} />
      {!data && <TextLink label="러닝으로 돌아가기" testID="home-resume-run" onPress={() => router.navigate('/run')} />}
    </View>
    {auth.ready && !auth.account && <Button label="회원가입 · 로그인" testID="home-signup" variant="outline" onPress={() => router.push('/account-entry')} />}
  </ScrollView>
    {(kind === 'initial' || kind === 'active') && <View style={styles.primaryAction}>
      {kind === 'initial' ? <Button label="코스 설정" testID="open-route-lab" trailing={<Icon name="chevronRight" />}
        onPress={() => router.navigate({ pathname: '/route-lab', params: { homeShape: shape, homeRequest: String(Date.now()) } })} />
        : <Button label={data!.active!.run.status === 'running' ? '러닝으로 돌아가기' : '이어 달리기'} testID="home-resume-run" trailing={<Icon name="chevronRight" />} onPress={() => router.navigate('/run')} />}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  content: { padding: space.xxl, gap: space.sm, flexGrow: 1 }, body: { gap: 10 },
  greeting: { fontSize: 32, lineHeight: 40 }, hero: { width: '100%', aspectRatio: 366 / 288, overflow: 'hidden', borderRadius: 15 },
  heroImage: { position: 'absolute', width: '129.23%', height: '109.49%', left: '-4.63%', top: '-3.82%' },
  shapes: { flexDirection: 'row', gap: 5 }, shape: { flex: 1, minHeight: 113, borderWidth: 2, borderRadius: radius.compact, paddingHorizontal: 4, paddingVertical: 16, gap: 10, alignItems: 'center', justifyContent: 'center' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, sectionTitle: { fontSize: 18, flexShrink: 1 },
  textLink: { minHeight: size.touch, paddingVertical: 12, flexDirection: 'row', gap: 4, alignItems: 'center' },
  primaryAction: { paddingHorizontal: space.xxl, paddingTop: space.sm, paddingBottom: space.xxl },
  preview: { width: '100%', borderRadius: 14, overflow: 'hidden', justifyContent: 'center' },
  activeMetrics: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' }, progress: { height: 19, borderRadius: 22, overflow: 'hidden' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 }, stat: { flexGrow: 1, flexBasis: 145, borderRadius: 14, padding: 12, gap: 10 },
  statHeading: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  recent: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, recentCard: { flexGrow: 1, flexBasis: 105, maxWidth: 124, gap: 4 },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.md }, loading: { paddingVertical: 32, alignItems: 'center', gap: 12 },
});
