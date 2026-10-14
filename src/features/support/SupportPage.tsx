import { Stack } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useThemeColors } from '@/theme/ThemeProvider';

export function SupportPage({ title, children }: PropsWithChildren<{ title: string }>) {
  const c = useThemeColors();
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.background }}>
    <Stack.Screen options={{ title }} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 40, gap: 20, width: '100%', maxWidth: 680, alignSelf: 'center' }}>{children}</ScrollView>
  </KeyboardAvoidingView>;
}
