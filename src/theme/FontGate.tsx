import { useEffect, useState, type PropsWithChildren } from 'react';
import { loadAsync } from 'expo-font';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { NotoSansKR_400Regular } from '@expo-google-fonts/noto-sans-kr/400Regular';
import { NotoSansKR_500Medium } from '@expo-google-fonts/noto-sans-kr/500Medium';
import { NotoSansKR_600SemiBold } from '@expo-google-fonts/noto-sans-kr/600SemiBold';
import { NotoSansKR_700Bold } from '@expo-google-fonts/noto-sans-kr/700Bold';
import { Roboto_400Regular } from '@expo-google-fonts/roboto/400Regular';
import { Roboto_500Medium } from '@expo-google-fonts/roboto/500Medium';
import { Roboto_600SemiBold } from '@expo-google-fonts/roboto/600SemiBold';
import { Roboto_700Bold } from '@expo-google-fonts/roboto/700Bold';

// Package assets are bundled by Metro. No runtime font download is performed.
export const fontSources = { NotoSansKR_400Regular, NotoSansKR_500Medium, NotoSansKR_600SemiBold, NotoSansKR_700Bold,
  Roboto_400Regular, Roboto_500Medium, Roboto_600SemiBold, Roboto_700Bold };
export function FontGate({ children }: PropsWithChildren) {
  const [attempt, setAttempt] = useState(0); const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    void loadAsync(fontSources).then(() => { if (active) setState('ready'); }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [attempt]);
  if (state === 'ready') return children;
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: 'white' }}>
    {state === 'loading' ? <><ActivityIndicator color="#FB5603" /><Text>글꼴을 준비하고 있어요.</Text></> : <>
      <Text accessibilityRole="alert">글꼴을 불러오지 못했어요.</Text>
      <Pressable accessibilityRole="button" onPress={() => { setState('loading'); setAttempt(n => n + 1); }} style={{ padding: 16, minHeight: 48 }}><Text>다시 시도</Text></Pressable>
    </>}
  </View>;
}
