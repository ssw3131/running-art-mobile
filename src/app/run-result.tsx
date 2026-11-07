import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Icon } from '@/components/ui';
import { useRunResult } from '@/features/achievements/use-run-result';
import { RunMetrics } from '@/features/achievements/RunMetrics';
import { homePathSvg } from '@/modules/home/model';
import { courseShapes } from '@/modules/courses/model';
import { useThemeColors } from '@/theme/ThemeProvider';
import { openServiceTab } from '@/features/service/open-service-tab';
import { badgeImages } from '@/features/achievements/badge-images';
import { AwardBadges } from '@/features/achievements/AwardBadges';

export default function RunResultScreen() {
  const params = useLocalSearchParams<{ id: string }>(), id = typeof params.id === 'string' ? params.id : '';
  const { data, error, retry } = useRunResult(id), colors = useThemeColors();
  const finished = data?.run.courseOutcome === 'finished' && !!data.course;
  const badge = data?.achievements.badges.find(item => item.shape === data.course?.snapshot.shape);
  const uri = data?.course ? homePathSvg([data.course.snapshot.target], colors.selected) : null;

  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 48, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
    <Stack.Screen options={{ title: finished ? '완주 결과' : '러닝 결과',headerShown:!finished }} />
    {!data && !error && <ActivityIndicator accessibilityLabel="러닝 결과 확인 중" color={colors.action} />}
    {!!error && <><AppText accessibilityRole="alert">{error}</AppText><Button label="다시 불러오기" onPress={retry} /></>}
    {data && <>
      <View style={{ alignItems: 'center', gap: 14, paddingTop: 14 }}>
        {finished && <><View style={{ position: 'absolute', top: 0, left: 24 }}><Image source={require('../../assets/achievements/sparkles.svg')} style={{ width: 24, height: 24 }} /></View>
          <View style={{ position: 'absolute', top: 4, right: 30 }}><Image source={require('../../assets/achievements/sparkle.svg')} style={{ width: 20, height: 20 }} /></View>
          <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF3EC', borderRadius: 28, borderWidth: 1.5, borderColor: '#FFD1BA' }}><Image testID="completion-trophy" source={require('../../assets/achievements/trophy.svg')} style={{ width: 26, height: 26 }} /></View></>}
        <AppText testID="run-result-title" weight="black" style={{ fontSize: 30, lineHeight: 42, textAlign: 'center' }}>{finished ? '완주를 축하합니다!' : '오늘의 러닝을 기록했어요'}</AppText>
      </View>
      {finished && uri && <View style={{ minHeight: 255, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Image source={require('../../assets/achievements/confetti.png')} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="contain" accessible={false} />
        {badgeImages[data.course!.snapshot.shape]?<Image testID={badge?.firstRunId===id?"completion-first-badge":undefined} source={badgeImages[data.course!.snapshot.shape]} style={{width:170,height:170}} accessibilityLabel={`${courseShapes[data.course!.snapshot.shape]} 완주 뱃지`}/>:<Image source={{uri}} style={{width:170,height:170}} accessibilityLabel="완주한 코스 도형"/>}
        <AppText testID="run-result-badge" weight="bold">{courseShapes[data.course!.snapshot.shape]} · {badge?.count ?? 0}회 완주</AppText>
      </View>}
      <RunMetrics run={data.run} />
      {finished&&<AwardBadges awards={data.achievements.awards??[]}/>}
      <AppText variant="caption" style={{ color: colors.subtle }}>활동 시간은 일시정지를 제외하며 GPS 대기 시간을 포함해요. 누적 완주 {data.achievements.finishedCourses}회 · 연속 러닝 {data.achievements.currentStreak}일</AppText>
      <Button label="공유하기" testID="run-result-share" leading={<Icon name="share" />} onPress={() => router.push({ pathname: '/run-card', params: { id } })} />
      <Button label="기록 상세" testID="result-detail" variant="outline" onPress={() => router.push({ pathname: '/runs/[id]', params: { id } })} />
      <Button label="홈으로" variant="outline" onPress={() => openServiceTab('/')} />
    </>}
  </ScrollView>;
}
