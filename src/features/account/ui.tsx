import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState, type PropsWithChildren } from 'react';
import { setStatusBarStyle } from 'expo-status-bar';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AccountPreferences } from '@/modules/account/model';
import type { Account } from '@/modules/auth/controller';
import { useProfilePhoto } from './use-profile-photo';

export const lightAccountColors = { background: '#F6F5F0', surface: '#FFFFFF', text: '#183C32', muted: '#57675F', border: '#D9E2DA', accent: '#183C32', onAccent: '#FFFFFF', danger: '#A12F2F' };
export type AccountColors = typeof lightAccountColors;
const dark: AccountColors = { background: '#111A17', surface: '#1D2B24', text: '#EFF6EF', muted: '#B3C5B9', border: '#3F5448', accent: '#B4DFB7', onAccent: '#13261B', danger: '#FFB2AC' };
export function useAccountColors(theme: AccountPreferences['theme']) {
  const system = useColorScheme(); return (theme === 'system' ? system : theme) === 'dark' ? dark : lightAccountColors;
}
export function AccountPage({ title, colors, children }: PropsWithChildren<{ title: string; colors: AccountColors }>) {
  const inset = useSafeAreaInsets();
  useFocusEffect(useCallback(() => {
    setStatusBarStyle(colors === dark ? 'light' : 'dark');
    return () => setStatusBarStyle('dark');
  }, [colors]));
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
    <Stack.Screen options={{ title, headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[accountStyles.page, { paddingBottom: Math.max(28, inset.bottom + 20) }]}>{children}</ScrollView>
  </KeyboardAvoidingView>;
}
export function AccountCard({ colors, children }: PropsWithChildren<{ colors: AccountColors }>) {
  return <View style={[accountStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>;
}
export function AccountButton({ title, onPress, colors, disabled = false, id, secondary = false }: { title: string; onPress(): void; colors: AccountColors; disabled?: boolean; id: string; secondary?: boolean }) {
  return <Pressable testID={id} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [accountStyles.button, { backgroundColor: secondary ? colors.surface : colors.accent, borderColor: colors.border, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    <Text style={[accountStyles.buttonText, { color: secondary ? colors.text : colors.onAccent }]}>{title}</Text>
  </Pressable>;
}
export function AccountRow({ title, detail, onPress, colors, id, danger = false, disabled = false }: { title: string; detail?: string; onPress(): void; colors: AccountColors; id: string; danger?: boolean; disabled?: boolean }) {
  return <Pressable testID={id} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [accountStyles.row, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1, borderColor: colors.border }]}>
    <View style={{ flex: 1, gap: 5 }}><Text style={[accountStyles.rowTitle, { color: danger ? colors.danger : colors.text }]}>{title}</Text>
      {!!detail && <Text style={[accountStyles.caption, { color: colors.muted }]}>{detail}</Text>}</View>
    <Text accessibilityElementsHidden style={{ color: colors.muted, fontSize: 24 }}>›</Text>
  </Pressable>;
}
export function ProfileAvatar({ account, colors, picture = account?.picture, preview }: { account: Account | null; colors: AccountColors; picture?: Account['picture']; preview?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const uploaded = useProfilePhoto(account?.id, picture === 'uploaded' && !preview ? account?.photoPath : null);
  const url = picture === 'provider' ? account?.avatarUrl : picture === 'uploaded' ? preview ?? uploaded : null;
  return <View style={[accountStyles.avatar, { backgroundColor: colors.background, borderColor: colors.border }]}>
    {url && failedUrl !== url ? <Image accessibilityLabel="프로필 사진" source={{ uri: url }} style={accountStyles.avatarImage} onError={() => setFailedUrl(url)} />
      : <Text accessibilityLabel="프로필 기본 이미지" style={{ color: colors.text, fontSize: 30, fontWeight: '700' }}>{[...(account?.name ?? 'R')][0]}</Text>}
  </View>;
}
export const accountStyles = StyleSheet.create({
  page: { flexGrow: 1, padding: 20, gap: 20, width: '100%', maxWidth: 680, alignSelf: 'center' },
  card: { borderRadius: 22, padding: 20, gap: 16, borderWidth: 1 },
  title: { fontSize: 25, lineHeight: 33, fontWeight: '700' },
  heading: { fontSize: 19, lineHeight: 27, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 24 },
  caption: { fontSize: 13, lineHeight: 20 },
  row: { minHeight: 64, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  button: { minHeight: 52, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  buttonText: { fontSize: 16, lineHeight: 24, fontWeight: '600', textAlign: 'center' },
  avatar: { height: 76, width: 76, borderRadius: 38, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarImage: { height: 76, width: 76 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18 },
});
