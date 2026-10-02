import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, Text } from 'react-native';
import { running } from '@/modules/running/runtime';
import { runErrorMessage } from '@/modules/running/model';

export default function RootLayout() {
  const [recoveryError, setRecoveryError] = useState('');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let mounted = true;
    const recover = () => { void running.monitor().then(() => { if (mounted) setRecoveryError(''); }).catch(error => { if (mounted) setRecoveryError(runErrorMessage(error)); }); };
    recover();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') recover(); });
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return (
    <>
      <StatusBar style="dark" />
      {!!recoveryError && <Text accessibilityRole="alert" style={{ color: '#A12F2F', padding: 16 }}>러닝 복원: {recoveryError}</Text>}
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#F6F5F0' }, headerTintColor: '#183C32' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="map" options={{ title: '내 주변 지도' }} />
        <Stack.Screen name="storage" options={{ title: '저장소 테스트' }} />
        <Stack.Screen name="route-lab" options={{ title: '코스 계산 테스트' }} />
        <Stack.Screen name="courses/index" options={{ title: '저장한 코스' }} />
        <Stack.Screen name="courses/[id]" options={{ title: '코스 상세' }} />
        <Stack.Screen name="run" options={{ title: '러닝 GPS 기록' }} />
        <Stack.Screen name="runs/index" options={{ title: '러닝 기록 목록' }} />
        <Stack.Screen name="runs/[id]" options={{ title: '러닝 상세' }} />
        <Stack.Screen name="road-file-lab" options={{ title: '도로 파일 검증' }} />
        <Stack.Screen name="road-cache-lab" options={{ title: '영구 도로 캐시' }} />
        <Stack.Screen name="environment" options={{ title: '개발 환경' }} />
      </Stack>
    </>
  );
}
