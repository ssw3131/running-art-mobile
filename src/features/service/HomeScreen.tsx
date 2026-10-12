import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Platform, ScrollView, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { runErrorMessage, statusLabel, type Run } from '@/modules/running/model';
import { useThemeColors } from '@/theme/ThemeProvider';

/** S0 functional entry. The three designed home states are implemented in S1. */
export default function HomeScreen() {
  const auth = useAuth(), c = useThemeColors();
  const [active, setActive] = useState<Run | null>(null), [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let mounted = true, busy = false;
    const refresh = async () => {
      if (busy || !auth.ready || Platform.OS !== 'android' || AppState.currentState !== 'active') return;
      busy = true;
      try { const run = await (await getStorage()).runs.active(); if (mounted) { setActive(run); setError(''); } }
      catch (cause) { if (mounted) setError(runErrorMessage(cause)); }
      finally { busy = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 2000);
    return () => { mounted = false; clearInterval(timer); };
  }, [auth.ready]));
  return <ScrollView testID="service-home" contentContainerStyle={{ padding: 24, gap: 24, flexGrow: 1, backgroundColor: c.background }}>
    <View style={{ gap: 10 }}>
      <AppText variant="title" weight="bold">{auth.account ? `${auth.account.name}님` : '달리는 길이, 나만의 작품으로'}</AppText>
      <AppText variant="heading" weight="medium">오늘은 어떤 그림을 달릴까요?</AppText>
      <AppText style={{ color: c.muted }}>도형을 골라 코스를 만들고, 달린 경로를 기록해 보세요.</AppText>
    </View>
    {active && <View testID="active-run-banner" style={{ padding: 20, gap: 12, borderRadius: 20, backgroundColor: c.navigation }}>
      <AppText variant="heading" weight="bold">{statusLabel[active.status]}</AppText>
      <AppText>{active.courseName || '진행 중인 러닝 기록'}</AppText>
      <Button label="러닝으로 돌아가기" testID="home-resume-run" onPress={() => router.navigate('/run')} />
    </View>}
    {!!error && <AppText accessibilityRole="alert" style={{ color: c.danger }}>{error}</AppText>}
    <Button label="코스 설정" testID="open-route-lab" onPress={() => router.navigate('/route-lab')} />
    <Button label="저장한 코스" testID="open-courses" variant="secondary" onPress={() => router.navigate({ pathname: '/courses', params: { view: 'courses' } })} />
    <Button label="러닝 기록 보기" testID="open-runs" variant="secondary" onPress={() => router.navigate({ pathname: '/courses', params: { view: 'runs' } })} />
  </ScrollView>;
}
