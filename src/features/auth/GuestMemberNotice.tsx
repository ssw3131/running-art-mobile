import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { useAuth } from './use-auth';

/** Do not load or expose legacy anonymous records in guest browsing. */
export function GuestMemberNotice({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.account) return children;
  return <View testID="guest-member-notice" style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 20 }}>
    <AppText weight="bold" variant="heading" style={{ textAlign: 'center' }}>회원가입하고 나만의 코스를 간직하세요</AppText>
    <AppText style={{ textAlign: 'center' }}>러닝과 기록 보관은 회원가입 후 이용할 수 있어요.</AppText>
    <Button label="회원가입하기" onPress={() => router.push({ pathname: '/account-entry', params: { mode: 'signup' } })} />
    <Button variant="outline" label="로그인" onPress={() => router.push({ pathname: '/account-entry', params: { mode: 'login' } })} />
  </View>;
}
