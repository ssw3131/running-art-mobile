import { Stack, router } from 'expo-router';
import { FontGate } from '@/theme/FontGate';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { UIPreviewScreen } from '@/features/ui-preview/UIPreviewScreen';

export default function UIPreviewRoute() {
  return <ThemeProvider><Stack.Screen options={{ headerShown: false }} /><FontGate>
    <UIPreviewScreen onBack={() => router.canGoBack() ? router.back() : router.replace('/environment')} />
  </FontGate></ThemeProvider>;
}
