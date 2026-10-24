import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { homeKind, homeRunOutcome, type HomeCourse, type HomeData, type HomeRun } from '@/modules/home/model';
import { durationLabel, elapsedMs } from '@/modules/running/model';
import { useThemeColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { MapCredits } from '@/features/course-generation/MapCredits';
import { HomePreview } from './HomePreview';
import { useHome } from './use-home';

const shapeAssets = {
  heart: { source: require('../../../assets/home/heart.svg'), width: 49.0004, height: 42.0002, name: '하트' },
  fish: { source: require('../../../assets/home/fish.svg'), width: 52.9996, height: 45.9984, name: '물고기' },
  dog: { source: require('../../../assets/home/dog.svg'), width: 52.9995, height: 45.9979, name: '강아지' },
};
type Shape = keyof typeof shapeAssets;
type Row = { key: string; kind: 'initial' | 'stats' | 'run-heading' | 'course-heading' | 'runs' | 'courses' | 'action' | 'credits'; runs?: HomeRun[]; courses?: HomeCourse[] };
const viewability = { itemVisiblePercentThreshold: 1 };
const km = (distance: number) => (distance / 1000).toFixed(1);
const date = (at: number) => { const d = new Date(at); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const openRuns = () => router.navigate({ pathname: '/courses', params: { view: 'runs' } });
const openCourses = () => router.navigate({ pathname: '/courses', params: { view: 'courses' } });

function TextLink({ label, onPress, testID }: { label: string; onPress(): void; testID: string }) {
  const c = useThemeColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} testID={testID} onPress={onPress} style={styles.textLink}>
    <AppText weight="medium" style={{ color: c.subtle, flexShrink: 1 }}>{label}</AppText>
    <Image source={require('../../../assets/ui/chevron-right.svg')} tintColor={c.subtle} contentFit="contain" style={{ width: 20, height: 20 }} accessible={false} />
  </Pressable>;
}

function InitialHome({ shape, setShape }: { shape: Shape; setShape(value: Shape): void }) {
  const c = useThemeColors();
  return <View testID="home-initial" style={{ gap: 10 }}>
    <AppText variant="heading" weight="medium">오늘은 어떤 그림을 달릴까요?</AppText>
    <AppText variant="label" style={{ color: c.muted }}>마음에 드는 모양을 골라보세요.{'\n'}익숙한 길이 나만의 러닝 아트가 됩니다.</AppText>
    <View accessible accessibilityLabel="RunPen, 달린 경로로 만드는 나만의 그림" style={styles.hero}>
      <Image source={require('../../../assets/home/intro.png')} contentFit="fill" accessible={false} style={styles.heroImage} />
    </View>
    <View style={styles.sectionHeading}><AppText weight="bold" style={styles.sectionTitle}>추천 도형 선택</AppText>
      <TextLink label="전체보기" testID="home-all-shapes" onPress={() => router.navigate({ pathname: '/route-lab', params: { homeSection: 'shapes', homeRequest: String(Date.now()) } })} />
    </View>
    <View style={styles.shapes}>{(Object.keys(shapeAssets) as Shape[]).map(id => {
      const asset = shapeAssets[id], selected = shape === id;
      return <Pressable key={id} testID={`home-shape-${id}`} accessibilityRole="button" accessibilityLabel={asset.name}
        accessibilityState={{ selected }} onPress={() => setShape(id)} style={[styles.shape, { borderColor: selected ? c.selected : c.outline }]}>
        <View style={{ width: 45, height: 38 }}><Image source={asset.source} accessible={false} contentFit="contain"
          style={{ position: 'absolute', width: asset.width, height: asset.height, left: (45 - asset.width) / 2, top: (38 - asset.height) / 2 }} /></View>
        <AppText weight="bold" style={{ color: selected ? c.selected : c.muted, fontSize: 18, textAlign: 'center' }}>{asset.name}</AppText>
      </Pressable>;
    })}</View>
  </View>;
}

function Stats({ data }: { data: HomeData }) {
  const c = useThemeColors(), { fontScale } = useWindowDimensions(), latest = data.latestCompleted;
  const stats = [
    { id: 'latest', label: '최근 러닝 기록', value: latest ? km(latest.distanceM) : '—', unit: latest ? 'km' : '', detail: latest ? date(latest.startedAt) : '아직 기록이 없어요', icon: require('../../../assets/home/sneaker.svg'), width: 20, height: 20 },
    { id: 'streak', label: '연속 러닝', value: String(data.currentStreak), unit: '일', detail: data.currentStreak ? '지금도 이어지는 중!' : '첫 러닝을 시작해 보세요', icon: require('../../../assets/home/flame.svg'), width: 16, height: 16 },
    { id: 'monthly', label: '달린 거리', value: data.monthlyDistanceM ? km(data.monthlyDistanceM) : '0', unit: 'km', detail: '이번 달 누적', icon: require('../../../assets/home/trophy.svg'), width: 16, height: 16 },
  ];
  return <View testID="home-history" style={{ gap: 10 }}>
    <AppText variant="heading" weight="medium">오늘도 멋지게 달려요!</AppText>
    <AppText variant="label" style={{ color: c.muted }}>달리는 순간, 더 특별한 하루가 됩니다.</AppText>
    <View style={[styles.stats, fontScale >= 1.4 && { flexDirection: 'column' }]}>{stats.map(stat => <View key={stat.id} testID={`home-stat-${stat.id}`} style={[styles.stat, { backgroundColor: c.navigation }]}>
      <View style={styles.statHeading}><Image source={stat.icon} style={{ width: stat.width, height: stat.height }} accessible={false} /><AppText variant="caption" weight="bold" style={{ color: c.subtle, flexShrink: 1 }}>{stat.label}</AppText></View>
      <AppText family="roboto" weight="black" style={{ fontSize: 24, lineHeight: 32, textAlign: 'center' }}>{stat.value}<AppText variant="caption"> {stat.unit}</AppText></AppText>
      <AppText variant="caption" style={{ color: c.subtle, textAlign: 'center' }}>{stat.detail}</AppText>
    </View>)}</View>
  </View>;
}

export default function HomeScreen() {
  const auth = useAuth(), c = useThemeColors(), { data, error, retry } = useHome();
  const { width, fontScale } = useWindowDimensions(), columns = fontScale >= 1.4 ? 1 : width < 390 ? 2 : 3;
  const list = useRef<FlatList<Row>>(null), [shape, setShape] = useState<Shape>('heart'), [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<Row>[] }) => setVisible(new Set(viewableItems.map(v => v.item.key))), []);
  useFocusEffect(useCallback(() => { setFocused(true); list.current?.scrollToOffset({ offset: 0, animated: false }); return () => setFocused(false); }, []));
  const kind = data ? homeKind(data) : null;
  const rows = useMemo(() => {
    if (!data) return [];
    if (kind === 'initial') return [{ key: 'initial', kind: 'initial' }, { key: 'action', kind: 'action' }] as Row[];
    const result: Row[] = [{ key: 'stats', kind: 'stats' }, { key: 'run-heading', kind: 'run-heading' }];
    for (let i = 0; i < Math.max(data.recent.length, 1); i += columns) result.push({ key: `runs-${i}`, kind: 'runs', runs: data.recent.slice(i, i + columns) });
    result.push({ key: 'course-heading', kind: 'course-heading' });
    for (let i = 0; i < Math.max(data.courses.length, 1); i += columns) result.push({ key: `courses-${i}`, kind: 'courses', courses: data.courses.slice(i, i + columns) });
    result.push({ key: 'credits', kind: 'credits' }, { key: 'action', kind: 'action' }); return result;
  }, [data, kind, columns]);
  return <View style={{ flex: 1, backgroundColor: c.background }}>
    <FlatList ref={list} testID="service-home" data={rows} keyExtractor={row => row.key} extraData={{ visible, focused, shape }}
      contentContainerStyle={styles.content} viewabilityConfig={viewability} onViewableItemsChanged={onViewableItemsChanged}
      ListHeaderComponent={<View style={{ gap: 12 }}><AppText weight="bold" style={styles.greeting}>{auth.account?.name || '러너'}님</AppText>
        {!data && !error && <View testID="home-loading" style={styles.loading}><ActivityIndicator color={c.action} /><AppText>홈 기록을 확인하고 있어요.</AppText></View>}
        {!!error && <View testID="home-error" style={{ gap: 12 }}><AppText accessibilityRole="alert" style={{ color: c.danger }}>{error}</AppText><Button label="홈 다시 확인" testID="home-retry" onPress={retry} /></View>}
      </View>}
      renderItem={({ item }) => {
        const active = focused && visible.has(item.key), cardWidth = `${100 / columns}%` as const;
        if (item.kind === 'initial') return <InitialHome shape={shape} setShape={setShape} />;
        if (item.kind === 'stats') return <Stats data={data!} />;
        if (item.kind === 'run-heading' || item.kind === 'course-heading') {
          const runs = item.kind === 'run-heading';
          return <View style={styles.sectionHeading}><AppText weight="bold" style={styles.sectionTitle}>{runs ? '최근 달린 코스' : '최근 저장 코스'}</AppText>
            <TextLink label="더보기" testID={runs ? 'home-more-runs' : 'home-more-courses'} onPress={runs ? openRuns : openCourses} /></View>;
        }
        if (item.kind === 'runs') return item.runs?.length ? <View style={styles.cards}>{item.runs.map(({ run, paths }) => {
          const outcome = homeRunOutcome(run), complete = outcome === '완주';
          return <Pressable key={run.id} testID={`home-run-${run.id}`} accessibilityRole="button" accessibilityLabel={`${run.courseName || '자유 러닝'}, ${outcome ?? '러닝 기록'}, ${km(run.distanceM)} 킬로미터, ${date(run.startedAt)}`}
            onPress={() => run.status === 'completed' ? router.push({ pathname: '/runs/[id]', params: { id: run.id } }) : router.navigate('/run')} style={[styles.card, { width: cardWidth }]}>
            <HomePreview paths={paths} active={active} label="실제 러닝 경로" />
            <View style={styles.cardHeading}><AppText variant="caption" weight="bold" style={{ flexShrink: 1 }}>{run.courseName || '자유 러닝'}</AppText>
              {outcome && <View style={{ backgroundColor: complete ? c.muted : c.action, paddingHorizontal: 5, borderRadius: 10 }}><AppText testID={`home-outcome-${run.id}`} style={{ color: complete ? c.surface : c.onAction, fontSize: 10, lineHeight: 16 }}>{outcome}</AppText></View>}</View>
            <AppText variant="caption" style={{ color: c.subtle }}>{km(run.distanceM)} km / {durationLabel(elapsedMs(run, Date.now()))}</AppText>
            <AppText variant="caption" style={{ color: c.subtle }}>{date(run.startedAt)}</AppText>
          </Pressable>;
        })}</View> : <AppText testID="home-empty-runs" style={{ color: c.muted }}>아직 달린 기록이 없어요. 첫 러닝을 시작해 보세요.</AppText>;
        if (item.kind === 'courses') return item.courses?.length ? <View style={styles.cards}>{item.courses.map(({ course, paths, previewError }) => <Pressable key={course.id}
          testID={`home-course-${course.id}`} accessibilityRole="button" accessibilityLabel={`${course.name}, ${course.lengthKm.toFixed(1)} 킬로미터, 저장 코스 보기`}
          onPress={() => router.push({ pathname: '/courses/[id]', params: { id: course.id } })} style={[styles.card, { width: cardWidth }]}>
          <HomePreview paths={paths} active={active} unavailable={previewError} synthetic={course.source === 'synthetic'} label="저장 코스 경로" />
          <AppText variant="caption" weight="bold">{course.name}</AppText><AppText variant="caption" style={{ color: c.subtle }}>{course.lengthKm.toFixed(1)} km</AppText>
          <AppText variant="caption" style={{ color: c.subtle }}>{date(course.createdAt)}</AppText>
        </Pressable>)}</View> : <AppText testID="home-empty-courses" style={{ color: c.muted }}>아직 저장한 코스가 없어요.</AppText>;
        if (item.kind === 'credits') return data!.recent.some(r => r.paths.length) || data!.courses.some(r => r.paths.length) ? <MapCredits /> : null;
        return <View style={styles.action}><Button label="코스 생성하러 가기" testID="open-route-lab" trailing={<Icon name="chevronRight" />}
          onPress={() => router.navigate(kind === 'initial' ? { pathname: '/route-lab', params: { homeSection: 'conditions', homeShape: shape, homeRequest: String(Date.now()) } } : '/route-lab')} /></View>;
      }} />
  </View>;
}

const styles = StyleSheet.create({
  content: { padding: space.xxl, gap: 12, flexGrow: 1 }, greeting: { fontSize: 32, lineHeight: 44 },
  loading: { padding: 24, gap: 12 }, hero: { width: '100%', aspectRatio: 366 / 288, overflow: 'hidden', borderRadius: 15, marginTop: 16 },
  heroImage: { position: 'absolute', width: '129.23%', height: '109.49%', left: '-4.63%', top: '-3.82%' },
  shapes: { flexDirection: 'row', gap: 5 }, shape: { flex: 1, minHeight: 113, borderWidth: 2, borderRadius: radius.compact, paddingHorizontal: 4, paddingVertical: 16, gap: 10, alignItems: 'center', justifyContent: 'center' },
  sectionHeading: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, sectionTitle: { fontSize: 18, flexShrink: 1 },
  textLink: { minHeight: 48, paddingVertical: 12, flexDirection: 'row', gap: 4, alignItems: 'center' },
  stats: { flexDirection: 'row', gap: 6, marginTop: 12 }, stat: { flex: 1, paddingHorizontal: 6, paddingVertical: 12, borderRadius: 16, gap: 10 },
  statHeading: { flexDirection: 'row', gap: 3, alignItems: 'center', justifyContent: 'center' },
  cards: { flexDirection: 'row', marginHorizontal: -4 }, card: { paddingHorizontal: 4, gap: 3, minHeight: 48 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 3, justifyContent: 'space-between', marginTop: 5 },
  action: { paddingTop: 24, paddingBottom: 8 },
});
