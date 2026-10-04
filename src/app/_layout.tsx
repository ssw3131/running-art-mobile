import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Text } from 'react-native';
import { authentication } from '@/modules/auth/runtime';
import { running } from '@/modules/running/runtime';
import { runErrorMessage } from '@/modules/running/model';
import { useAuth } from '@/features/auth/use-auth';
import { personalSync } from '@/modules/sync/runtime';
import { accountWithdrawal } from '@/modules/account/withdrawal-runtime';

export default function RootLayout() {
  const auth=useAuth();
  const [recoveryError, setRecoveryError] = useState('');
  useEffect(() => {
    void authentication.start();
    void accountWithdrawal.start();
    personalSync.start();
    personalSync.setActive(AppState.currentState==='active');
    authentication.setActive(AppState.currentState === 'active');
    const links = Linking.addEventListener('url', ({ url }) => { void authentication.handleUrl(url); });
    void Linking.getInitialURL().then(url => { if (url) return authentication.handleUrl(url); }).catch(() => undefined);
    const lifecycle = AppState.addEventListener('change', state => {authentication.setActive(state === 'active');personalSync.setActive(state==='active');});
    return () => { links.remove(); lifecycle.remove(); authentication.setActive(false);personalSync.setActive(false); };
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'android' || !auth.ready) return;
    let mounted = true;
    const recover = () => { void running.monitor().then(() => { if (mounted) setRecoveryError(''); }).catch(error => { if (mounted) setRecoveryError(runErrorMessage(error)); }); };
    recover();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') recover(); });
    return () => { mounted = false; subscription.remove(); };
  }, [auth.ready,auth.account?.id]);
  return (
    <>
      <StatusBar style="dark" />
      {!!recoveryError && <Text accessibilityRole="alert" style={{ color: '#A12F2F', padding: 16 }}>러닝 복원: {recoveryError}</Text>}
      <Stack key={auth.ready?auth.account?.id??'guest':'loading'} screenOptions={{ headerStyle: { backgroundColor: '#F6F5F0' }, headerTintColor: '#183C32' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ title: '마이페이지' }} />
        <Stack.Screen name="account-profile" options={{ title: '프로필 편집' }} />
        <Stack.Screen name="account-settings" options={{ title: '설정' }} />
        <Stack.Screen name="account-sync" options={{ title: '개인 기록 동기화' }} />
        <Stack.Screen name="account-withdraw" options={{ title: '회원 탈퇴' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="map" options={{ title: '내 주변 지도' }} />
        <Stack.Screen name="storage" options={{ title: '저장소 테스트' }} />
        <Stack.Screen name="route-lab" options={{ title: '코스 만들기' }} />
        <Stack.Screen name="courses/index" options={{ title: '저장한 코스' }} />
        <Stack.Screen name="courses/[id]" options={{ title: '코스 상세' }} />
        <Stack.Screen name="run" options={{ title: '러닝 GPS 기록' }} />
        <Stack.Screen name="guidance" options={{ headerShown: false }} />
        <Stack.Screen name="runs/index" options={{ title: '러닝 기록 목록' }} />
        <Stack.Screen name="runs/[id]" options={{ title: '러닝 상세' }} />
        <Stack.Screen name="road-file-lab" options={{ title: '도로 파일 검증' }} />
        <Stack.Screen name="road-cache-lab" options={{ title: '영구 도로 캐시' }} />
        <Stack.Screen name="environment" options={{ title: '개발 환경' }} />
      </Stack>
    </>
  );
}
