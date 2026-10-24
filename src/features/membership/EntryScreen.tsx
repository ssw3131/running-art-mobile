import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import type { SignInProvider } from '@/modules/auth/providers';
import { SignupBrand } from './SignupBrand';
import { SocialButton } from './SocialButton';
import { useThemeColors } from '@/theme/ThemeProvider';

export default function EntryScreen() {
  const auth = useAuth(), c = useThemeColors();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [signup, setSignup] = useState(params.mode !== 'login');
  const [provider, setProvider] = useState<SignInProvider | null>(null);
  return <SafeAreaView edges={['bottom']} style={{ flex: 1 }}><ScrollView testID="signup-entry" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingTop: signup ? 50 : 74, paddingBottom: 40, gap: 30, width: '100%', maxWidth: 412, alignSelf: 'center' }}>
    <SignupBrand />
    <View style={{ gap: 15, alignItems: 'center' }}>
      <AppText variant={signup ? 'title' : 'heading'} weight={signup ? 'black' : 'medium'} style={{ textAlign: 'center' }}>{signup ? 'RunPen 회원 가입' : '나의 러닝을 작품으로 간직하세요'}</AppText>
      <AppText variant="label" style={{ color: c.muted, textAlign: 'center' }}>{signup ? '당신의 러닝이 더 특별한 이야기가 되는 곳,\n지금 바로 시작하세요.' : '로그인하고, 달려온 길과 완성한 그림을\n차곡차곡 쌓아보세요.'}</AppText>
    </View>
    {/* S7 has not granted any bonus. The promotional Figma example is omitted. */}
    <View style={{ gap: 17, marginTop: signup ? 40 : 69 }}>
      {auth.account ? <Button label="가입 상태 확인하기" onPress={() => router.replace('/account-signup')} />
        : (['kakao', 'custom:naver', 'google'] as const).filter(p => auth.providers.includes(p)).map(p => <SocialButton key={p} provider={p} signup={signup}
          disabled={!auth.ready || !auth.configured || auth.busy} busy={auth.busy && provider === p}
          onPress={() => { setProvider(p); void authentication.signIn(p); }} />)}
    </View>
    {!!auth.message && <AppText testID="signup-auth-message" accessibilityRole="alert">{auth.message}</AppText>}
    {!auth.configured && <AppText accessibilityRole="alert">로그인 연결을 사용할 수 없어요. 앱 설정 또는 업데이트를 확인해 주세요.</AppText>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: signup ? 0 : 85 }}>
      <AppText variant="label">{signup ? '이미 계정이 있으신가요? ' : '계정이 없으신가요? '}</AppText>
      <Pressable testID="signup-mode" accessibilityRole="link" accessibilityLabel={signup ? '로그인' : '회원가입'} accessibilityState={{ disabled: auth.busy }} disabled={auth.busy} onPress={() => setSignup(!signup)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 }}>
        <AppText variant="label" weight="bold" style={{ color: c.background === '#121212' ? '#8CB4FF' : '#0453FE', textDecorationLine: 'underline' }}>{signup ? '로그인' : '회원가입'}</AppText>
      </Pressable>
    </View>
  </ScrollView></SafeAreaView>;
}
