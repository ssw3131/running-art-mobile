import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#F6F5F0' }, headerTintColor: '#183C32' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="map" options={{ title: '내 주변 지도' }} />
        <Stack.Screen name="storage" options={{ title: '저장소 테스트' }} />
        <Stack.Screen name="environment" options={{ title: '개발 환경' }} />
      </Stack>
    </>
  );
}
