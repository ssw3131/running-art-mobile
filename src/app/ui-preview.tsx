import { Stack, router, useLocalSearchParams } from 'expo-router';
import { FontGate } from '@/theme/FontGate';
import { ThemeProvider } from '@/theme/ThemeProvider';
import RunningPreview from '@/features/ui-preview/RunningPreview';
import { UIPreviewScreen } from '@/features/ui-preview/UIPreviewScreen';

export default function UIPreviewRoute() {
  const params=useLocalSearchParams<{running?:string}>();
  return <ThemeProvider><Stack.Screen options={{ headerShown: false }} /><FontGate>
    {params.running==='1'?<RunningPreview/>:<UIPreviewScreen onBack={() => router.canGoBack() ? router.back() : router.replace('/environment')} />}
  </FontGate></ThemeProvider>;
}
