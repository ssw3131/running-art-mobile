import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { serviceTabs } from '@/features/service/navigation';
import { AppText, Button, Icon } from '@/components/ui';
import { useRunResult } from '@/features/achievements/use-run-result';
import { useThemeColors } from '@/theme/ThemeProvider';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { getStorage } from '@/modules/storage/database';
import { courseShapes } from '@/modules/courses/model';
import { durationLabel } from '@/modules/running/model';
import { prepareRunRetry } from '@/modules/running/retry';
import { homePathSvg } from '@/modules/home/model';
import { centerLabel } from '@/features/course-generation/model';
import { useTerrain } from '@/features/terrain/use-terrain';
import { DifficultyTag } from '@/features/course-generation/DifficultyTag';
import { GenerationIcon } from '@/features/course-generation/GenerationIcon';
import { openServiceTab } from '@/features/service/open-service-tab';
import { shareRunCourseGpx } from '@/modules/courses/share-gpx';
import RunPath from './RunPath';
import RunSharePanel from './RunSharePanel';

export default function CompletedDetail({ id }: { id: string }) {
  const { data, error, retry } = useRunResult(id), c = useThemeColors(), auth = useAuth(), insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const working = useRef(false);
  const terrain = useTerrain(data?.course?.snapshot.route, true);
  const first = data?.achievements.badges.some(b => b.shape === data.course?.snapshot.shape && b.firstRunId === id);
  async function act(task: () => Promise<unknown>) {
    if (working.current) return;
    working.current = true; setBusy(true); setFailure('');
    try { await task(); } catch (e) { setFailure(e instanceof Error ? e.message : '다시 시도해 주세요.'); }
    finally { working.current = false; setBusy(false); }
  }
  const rechallenge = () => void act(async () => {
    const owner = auth.account?.id ?? '';
    const check = () => { if ((authentication.getSnapshot().account?.id ?? '') !== owner) throw new Error('계정이 바뀌었어요.'); };
    const db = await getStorage(); check();
    const saved = await prepareRunRetry(db, id, check); check();
    openServiceTab({ pathname: '/run', params: { courseId: saved.id } });
  });
  return <View style={{flex:1,backgroundColor:c.background}}><ScrollView contentContainerStyle={{ paddingBottom: 36, gap: 24 }}>
    <Stack.Screen options={{ title: '완주 기록 상세' }}/>
    {!data && !error && <ActivityIndicator accessibilityLabel="완주 기록 불러오는 중"/>}
    {!!(error || failure) && <View style={{ padding: 24, gap: 12 }}><AppText accessibilityRole="alert">{error || failure}</AppText>{!!error && <Button label="다시 불러오기" onPress={retry}/>}</View>}
    {data?.course && data.run.courseOutcome === 'finished' && <>
      <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 24, gap: 10 }}>
        <View style={{ height: 180, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Image source={require('../../../assets/archive/confetti.png')} style={{ position: 'absolute', width: '100%', height: 180 }} contentFit="contain" accessible={false}/>
          {first ? data.course.snapshot.shape === 'heart' ? <Image testID="completion-first-badge" source={require('../../../assets/archive/heart-badge-cropped.png')} style={{ width: 160, height: 160 }} contentFit="contain" accessibilityLabel="하트 첫 완주 배지"/> :
            <View testID="completion-first-badge" accessibilityLabel={`${courseShapes[data.course.snapshot.shape]} 첫 완주 배지`} style={{ width: 150, height: 150, borderRadius: 75, borderColor: c.action, borderWidth: 3, backgroundColor: c.surface, padding: 20 }}><Image source={{ uri: homePathSvg([data.course.snapshot.target], c.selected)! }} style={{ flex: 1 }} accessible={false}/></View> :
            <Image testID="completion-trophy" source={require('../../../assets/archive/trophy.png')} style={{ width: 150, height: 150 }} contentFit="contain" accessibilityLabel="완주 트로피"/>}
        </View>
        <AppText weight="black" style={{ textAlign: 'center', fontSize: 24, lineHeight: 34 }}><AppText weight="black" style={{ color: c.action }}>{auth.account?.name || '러너'}님</AppText>{'\n'}완주를 축하합니다.</AppText>
        <AppText variant="caption" style={{ color: c.muted }}>{first ? `${courseShapes[data.course.snapshot.shape]} 배지를 처음 획득했어요.` : '새로운 완주 기록을 남겼어요.'}</AppText>
        <View style={{ borderRadius: 20, borderWidth: 1, borderColor: c.action, padding: 20, width: '100%', gap: 12, backgroundColor: c.surface }}>
          <AppText weight="black" variant="heading" style={{ textAlign: 'center' }}>{data.course.name}</AppText>
          <View style={{ height: 1, backgroundColor: c.divider }}/>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
            <View><AppText variant="caption">실제 거리</AppText><AppText weight="black" style={{ fontSize: 24, color: c.action }}>{(data.run.distanceM / 1000).toFixed(2)} km</AppText></View>
            <View><AppText variant="caption">실제 러닝 시간</AppText><AppText weight="black" style={{ fontSize: 24, color: c.action }}>{durationLabel(data.run.activeMs)}</AppText></View>
          </View>
          <AppText variant="caption">{new Date(data.run.startedAt).toLocaleDateString('ko-KR')}</AppText>
        </View>
      </View>
      <RunPath points={data.points} background/>
      <View style={{ paddingHorizontal: 24, gap: 16 }}>
        <AppText weight="bold">코스명   {data.course.name}</AppText>
        <AppText variant="label">코스 기준 위치   {centerLabel(data.course.snapshot.origin)}</AppText>
        <AppText variant="label">코스 거리   {data.course.snapshot.lengthKm.toFixed(2)} km</AppText>
        <DifficultyTag state={{ kind: terrain.state.profile ? 'ready' : terrain.state.status === 'loading' ? 'loading' : 'error', profile: terrain.state.profile ?? undefined }}/>
        <AppText variant="caption" style={{ color: c.muted }}>활동 시간은 일시정지를 제외하며 GPS 대기 시간을 포함합니다. 삭제된 코스를 재도전하려면 사본 저장에 저장 횟수 1회를 사용합니다.</AppText>
        <Button testID="run-rechallenge" label="러닝 재도전하기" leading={<GenerationIcon name="run"/>} disabled={busy} onPress={rechallenge}/>
        <Button label="GPX 파일 내보내기" variant="secondary" disabled={busy} onPress={() => void act(() => shareRunCourseGpx(id))}/>
        <Button label="공유 이미지 만들기" variant="outline" leading={<Icon name="share"/>} onPress={() => router.push({ pathname: '/run-card', params: { id } })}/>
        <RunSharePanel id={id} disabled={busy} onBusy={setBusy}/>
        <Button label="기록 삭제하기" variant="outline" disabled={busy} onPress={() => Alert.alert('완주 기록을 삭제할까요?', '이 기록의 GPS와 요약을 삭제하고 배지·통계를 다시 계산합니다.', [
          { text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void act(async () => { await (await getStorage()).runs.remove(id); if (router.canGoBack()) router.back(); else router.replace({ pathname: '/courses', params: { view: 'runs' } }); }) },
        ])}/>
      </View>
    </>}
  </ScrollView><BottomTabBar value="archive" bottomInset={insets.bottom} onChange={value=>{const tab=serviceTabs.find(t=>t.value===value);if(tab)openServiceTab(tab.href);}}/></View>;
}
