import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { openServiceTab } from '@/features/service/open-service-tab';
import type { SignInProvider } from '@/modules/auth/providers';
import { SignupBrand } from './SignupBrand';
import { SocialButton } from './SocialButton';
import { useThemeColors } from '@/theme/ThemeProvider';

export default function EntryScreen() {
  const auth = useAuth(), c = useThemeColors();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [signup, setSignup] = useState(params.mode !== 'login');
  const [provider, setProvider] = useState<SignInProvider | null>(null);
  return <ScrollView testID="signup-entry" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingTop: 28, paddingBottom: 40, gap: 30, width: '100%', maxWidth: 464, alignSelf: 'center' }}>
    <SignupBrand />
    <View style={{ gap: 15, alignItems: 'center' }}>
      <AppText variant={signup ? 'title' : 'heading'} weight={signup ? 'black' : 'medium'} style={{ textAlign: 'center' }}>{signup ? 'RunPen 회원 가입' : '나의 러닝을 작품으로 간직하세요'}</AppText>
      <AppText variant="label" style={{ color: c.muted, textAlign: 'center' }}>{signup ? '당신의 러닝이 더 특별한 이야기가 되는 곳,\n지금 바로 시작하세요.' : '로그인하고, 달려온 길과 완성한 그림을\n차곡차곡 쌓아보세요.'}</AppText>
    </View>
    {/* S7 has not granted any bonus. The promotional Figma example is omitted. */}
    <View style={{ gap: 17, marginTop: 20 }}>
      {auth.account ? <Button label="가입 상태 확인하기" onPress={() => router.replace('/account-signup')} />
        : (['kakao', 'custom:naver', 'google'] as const).filter(p => auth.providers.includes(p)).map(p => <SocialButton key={p} provider={p} signup={signup}
          disabled={!auth.ready || !auth.configured || auth.busy} busy={auth.busy && provider === p}
          onPress={() => { setProvider(p); void authentication.signIn(p); }} />)}
    </View>
    {!!auth.message && <AppText testID="signup-auth-message" accessibilityRole="alert">{auth.message}</AppText>}
    {!auth.configured && <AppText accessibilityRole="alert">이 버전에서는 로그인을 연결할 수 없어요. 기존 기능은 게스트로 이용할 수 있어요.</AppText>}
    <Button testID="signup-mode" label={signup ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'} variant="outline" compact disabled={auth.busy} onPress={() => setSignup(!signup)} />
    <Button testID="signup-guest" label={auth.account ? '마이페이지로 돌아가기' : '게스트로 입장하기'} variant="outline" disabled={auth.busy} onPress={() => openServiceTab(auth.account ? '/account' : '/')} />
  </ScrollView>;
}
