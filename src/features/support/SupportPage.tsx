import { Stack } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/theme/ThemeProvider';

export function SupportPage({ title, children, footer }: PropsWithChildren<{ title: string; footer?: ReactNode }>) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.background }}>
    <Stack.Screen options={{ title }} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 40, gap: 20, width: '100%', maxWidth: 680, alignSelf: 'center' }}>{children}</ScrollView>
    {footer && <View style={{ padding: 16, paddingBottom: Math.max(16, insets.bottom), borderTopWidth: 1, borderColor: c.divider, width: '100%', maxWidth: 680, alignSelf: 'center' }}>{footer}</View>}
  </KeyboardAvoidingView>;
}
