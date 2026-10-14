import { View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { SupportPage } from '@/features/support/SupportPage';
import { SupportArt } from '@/features/support/SupportArt';
import { openServiceTab } from '@/features/service/open-service-tab';
import { useThemeColors } from '@/theme/ThemeProvider';
export default function ServiceAbout() {
  const c = useThemeColors();
  return <SupportPage title="서비스 소개">
    <AppText variant="title" weight="black">달리는 길이,{'\n'}나만의 작품으로.</AppText>
    <AppText style={{ color: c.muted }}>RunPen과 함께 일상의 러닝을 특별한 기록으로 만들어보세요.</AppText>
    <SupportArt kind="about" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{[
      ['GPS 러닝 기록', '실제로 달린 길과 거리·시간을 기록해요.'], ['나만의 러닝아트', '도형·직접 그리기·이미지 윤곽으로 코스를 만들어요.'],
      ['기록 공유', '이미지 카드나 코스 링크로 내 러닝을 전해요.'], ['도전과 성취', '한 바퀴 완주하고 도형 배지를 모아보세요.'],
    ].map(([title, body]) => <View key={title} style={{ flexBasis: '45%', flexGrow: 1, padding: 16, gap: 8, borderWidth: 1, borderColor: c.divider, borderRadius: 20 }}><AppText weight="bold">{title}</AppText><AppText variant="label" style={{ color: c.muted }}>{body}</AppText></View>)}</View>
    <Button label="코스 생성하러 가기" onPress={() => openServiceTab('/route-lab')} />
  </SupportPage>;
}
