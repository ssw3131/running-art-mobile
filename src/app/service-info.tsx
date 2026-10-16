import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { SupportPage } from '@/features/support/SupportPage';
import { useThemeColors } from '@/theme/ThemeProvider';

const quick = [
  { id: 'guide', title: '이용 방법', route: '/service-guide', icon: require('../../assets/support/guide.svg') },
  { id: 'faq', title: 'FAQ', route: '/service-faq', icon: require('../../assets/support/faq.svg') },
  { id: 'inquiry', title: '문의 보내기', route: '/service-inquiry', icon: require('../../assets/support/inquiry.svg') },
  { id: 'notices', title: '공지 사항', route: '/service-notices', icon: require('../../assets/support/notice.svg') },
];
const policies = [
  { id: 'terms', title: '이용약관', icon: require('../../assets/support/terms.svg') },
  { id: 'privacy', title: '개인정보 처리방침', icon: require('../../assets/support/privacy.svg') },
  { id: 'location', title: '위치기반 서비스 이용약관', icon: require('../../assets/support/location.svg') },
];
export default function ServiceInfoScreen() {
  const c = useThemeColors();
  return <SupportPage title="서비스 안내 및 지원">
    <View style={{ backgroundColor: '#FFF1E6', borderRadius: 20, padding: 18, gap: 20, overflow: 'hidden' }}>
      <AppText variant="title" weight="black" style={{ color: '#000000' }}>달리는 길이,{'\n'}나만의 작품으로</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="label" weight="bold" style={{ color: '#757575', flex: 1 }}>RunPen과 함께,{'\n'}일상의 러닝을 특별한{'\n'}기록으로 만들어보세요.</AppText>
        <View accessible={false} style={{ width: '48%', aspectRatio: 210 / 136, overflow: 'hidden' }}><Image source={require('../../assets/support/intro.png')} contentFit="fill" style={{ width: '192.74%', height: '198.28%' }} /></View>
      </View>
      <Button label="서비스 소개 바로가기" testID="support-about" compact onPress={() => router.push('/service-about')} />
    </View>
    <AppText variant="heading" weight="bold">빠른 메뉴</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {quick.map(item => <Pressable key={item.id} testID={`support-${item.id}`} accessibilityRole="button" accessibilityLabel={item.title}
        onPress={() => router.push(item.route as Href)} style={{ flexBasis: '45%', flexGrow: 1, minHeight: 80, padding: 15, gap: 8, borderRadius: 20, borderWidth: 1, borderColor: c.divider, backgroundColor: c.surface }}>
        <Image source={item.icon} style={{ width: 24, height: 24 }} accessible={false} /><AppText weight="bold" variant="label">{item.title}</AppText>
      </Pressable>)}
    </View>
    <AppText variant="heading" weight="bold">약관 및 정책</AppText>
    {policies.map(item => <Pressable key={item.id} testID={`support-${item.id}`} accessibilityRole="button" accessibilityLabel={item.title}
      onPress={() => router.push({ pathname: '/service-policy', params: { kind: item.id } })}
      style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: c.divider }}>
      <Image source={item.icon} style={{ width: 24, height: 24 }} accessible={false} /><AppText style={{ flex: 1 }}>{item.title}</AppText><Icon name="chevronRight" />
    </Pressable>)}
    <AppText variant="caption" style={{ color: c.muted, textAlign: 'center' }}>앱 버전 {Constants.expoConfig?.version ?? '확인 중'}</AppText>
    <Button label="개발 도구" testID="open-development" variant="outline" compact onPress={() => router.push('/development')} />
  </SupportPage>;
}
