import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import type { SignInProvider } from '@/modules/auth/providers';
import { radius, size } from '@/theme/tokens';

const providers = {
  kakao: { name: '카카오', background: '#FEE500', color: '#191919', source: require('../../../assets/signup/kakao.svg'), width: 26, height: 25 },
  'custom:naver': { name: '네이버', background: '#03A94D', color: '#FFFFFF', source: require('../../../assets/signup/naver.svg'), width: 22, height: 22 },
  // The original filtered SVG triggers emulator graphics crashes. Use its
  // unchanged Figma PNG export so gradients do not execute in the Android GPU.
  google: { name: 'Google', background: '#FFFFFF', color: '#191919', source: require('../../../assets/signup/google.png'), width: 26.4565, height: 26.3695 },
};
export function SocialButton({ provider, signup, disabled, busy, onPress }: {
  provider: SignInProvider; signup: boolean; disabled: boolean; busy: boolean; onPress(): void;
}) {
  const p = providers[provider];
  const label = `${p.name}로 ${signup ? '회원가입' : '계속하기'}`;
  return <Pressable testID={`signup-${provider.replace('custom:', '')}`} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: size.button, borderRadius: radius.button, backgroundColor: p.background,
      borderWidth: provider === 'google' ? 1 : 0, borderColor: '#B3B3B3', paddingHorizontal: 20, paddingVertical: 13, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 })}>
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      {busy ? <ActivityIndicator color={p.color} /> : <Image source={p.source} style={{ width: p.width, height: p.height }} contentFit="contain" accessible={false} />}
      <AppText weight="bold" variant="heading" style={{ color: p.color, flexShrink: 1, textAlign: 'center' }}>{label}</AppText>
    </View>
  </Pressable>;
}
