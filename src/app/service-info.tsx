import { router } from 'expo-router';
import Constants from 'expo-constants';
import { ScrollView } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { openServiceTab } from '@/features/service/open-service-tab';

/** S0 menu destinations are real existing features; support/policy content is S6. */
export default function ServiceInfoScreen() {
  return <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48, gap: 20 }}>
    <AppText variant="title" weight="bold">달리는 길이,{ '\n' }나만의 작품으로</AppText>
    <AppText>원하는 도형으로 코스를 만들고, GPS로 달린 경로를 기록해요. 저장한 코스와 러닝 기록은 보관함에서 다시 볼 수 있어요.</AppText>
    <Button label="코스 만들기" onPress={() => openServiceTab('/route-lab')} />
    <Button label="기록 보관함" variant="secondary" onPress={() => openServiceTab('/courses')} />
    <Button label="마이페이지 · 설정" variant="secondary" onPress={() => openServiceTab('/account')} />
    <AppText variant="caption">서비스 소개·이용 방법·FAQ·문의·공지·약관은 준비 중이에요.</AppText>
    <Button label="개발 도구" testID="open-development" variant="outline" onPress={() => router.push('/development')} />
    <AppText variant="caption">앱 버전 {Constants.expoConfig?.version ?? '확인 중'}</AppText>
  </ScrollView>;
}
