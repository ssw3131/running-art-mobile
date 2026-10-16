import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontGate } from '@/theme/FontGate';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useServiceTheme } from '@/theme/use-service-theme';
import { AppText, Button } from '@/components/ui';
import { ServiceHeader } from '@/features/service/ServiceHeader';
import { authentication } from '@/modules/auth/runtime';
import { running } from '@/modules/running/runtime';
import { runErrorMessage } from '@/modules/running/model';
import { useAuth } from '@/features/auth/use-auth';
import { personalSync } from '@/modules/sync/runtime';
import { accountWithdrawal } from '@/modules/account/withdrawal-runtime';
import { membership } from '@/modules/membership/runtime';
import { MembershipPrompt } from '@/features/membership/MembershipPrompt';

// A cold detail/deep link has a stable service-home destination for Back.
export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  const auth=useAuth();
  const theme = useServiceTheme();
  const recoveryScope = auth.ready ? auth.account?.id ?? 'guest' : 'loading';
  const [recovery, setRecovery] = useState({ scope: '', message: '' });
  const recoveryError = recovery.scope === recoveryScope ? recovery.message : '';
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  useEffect(() => {
    void authentication.start();
    membership.start();
    void accountWithdrawal.start();
    personalSync.start();
    personalSync.setActive(AppState.currentState==='active');
    authentication.setActive(AppState.currentState === 'active');
    const links = Linking.addEventListener('url', ({ url }) => { void authentication.handleUrl(url); });
    void Linking.getInitialURL().then(url => { if (url) return authentication.handleUrl(url); }).catch(() => undefined);
    const lifecycle = AppState.addEventListener('change', state => {
      authentication.setActive(state === 'active'); personalSync.setActive(state === 'active');
      // Returning from the photo picker must not reset the open consent form.
      if (state === 'active' && membership.getSnapshot().status !== 'required') void membership.reload();
    });
    return () => { links.remove(); lifecycle.remove(); authentication.setActive(false);personalSync.setActive(false); };
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'android' || !auth.ready) return;
    let mounted = true;
    const recover = () => { void running.monitor().then(() => { if (mounted) setRecovery({ scope: recoveryScope, message: '' }); }).catch(error => { if (mounted) setRecovery({ scope: recoveryScope, message: runErrorMessage(error) }); }); };
    recover();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') recover(); });
    return () => { mounted = false; subscription.remove(); };
  }, [auth.ready,recoveryScope,recoveryAttempt]);
  return (
    <ThemeProvider palette={theme.palette}><FontGate><SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.palette.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      {!!recoveryError && <View style={{ padding: 12, gap: 8 }}>
        <AppText accessibilityRole="alert" style={{ color: theme.palette.danger }}>러닝 복원: {recoveryError}</AppText>
        <Button label="복원 다시 시도" compact onPress={() => setRecoveryAttempt(value => value + 1)} />
      </View>}
      <Stack key={auth.ready?auth.account?.id??'guest':'loading'} screenOptions={{
        contentStyle: { backgroundColor: theme.palette.background },
        header: ({ options }) => <ServiceHeader title={options.title ?? 'RunPen'} back />,
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="service-info" options={{ title: '서비스 안내 및 지원', header: () => <ServiceHeader title="서비스 안내 및 지원" back menu={false} /> }} />
        <Stack.Screen name="development" options={{ title: '개발 도구' }} />
        <Stack.Screen name="account-profile" options={{ title: '프로필 편집' }} />
        <Stack.Screen name="account-entry" options={{ title: '가입 · 로그인' }} />
        <Stack.Screen name="account-signup" options={{ title: '가입 정보 · 약관 동의' }} />
        <Stack.Screen name="account-settings" options={{ title: '설정' }} />
        <Stack.Screen name="account-sync" options={{ title: '개인 기록 동기화' }} />
        <Stack.Screen name="account-withdraw" options={{ title: '회원 탈퇴' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="map" options={{ title: '내 주변 지도' }} />
        <Stack.Screen name="storage" options={{ title: '저장소 테스트' }} />
        <Stack.Screen name="courses/[id]" options={{ title: '코스 상세' }} />
        <Stack.Screen name="course-candidate" options={{ title: '코스 상세', header: () => <ServiceHeader title="코스 상세" back menu={false} /> }} />
        <Stack.Screen name="guidance" options={{ headerShown: false }} />
        <Stack.Screen name="runs/index" options={{ title: '러닝 기록 목록' }} />
        <Stack.Screen name="runs/[id]" options={{ title: '러닝 상세' }} />
        <Stack.Screen name="road-file-lab" options={{ title: '도로 파일 검증' }} />
        <Stack.Screen name="road-cache-lab" options={{ title: '영구 도로 캐시' }} />
        <Stack.Screen name="environment" options={{ title: '개발 환경' }} />
      </Stack>
      <MembershipPrompt />
    </SafeAreaView></FontGate></ThemeProvider>
  );
}
