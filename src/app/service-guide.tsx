import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { SupportPage } from '@/features/support/SupportPage';
import { GuideArt } from '@/features/support/SupportArt';
import { useThemeColors } from '@/theme/ThemeProvider';
const steps = [
  ['원하는 코스 만들기', '코스 생성에서 지도 중심·도형·목표 거리를 정하고 조건을 확인해 주세요. 도형 대신 직접 그리기나 이미지 윤곽도 사용할 수 있어요.'],
  ['후보 확인하고 저장하기', '계산된 후보의 실제 거리와 경로를 확인하세요. 마음에 드는 코스는 상세 화면에서 저장하거나 러닝 준비로 이동할 수 있어요.'],
  ['실제 길을 달리기', '위치 권한을 확인하고 출발 지점과 방향을 선택하세요. 코스까지 합류한 뒤 한 바퀴를 달립니다. 일시정지·종료는 러닝 화면에서 할 수 있어요.'],
  ['완주와 기록 확인하기', '한 바퀴 도착 후 종료·저장을 확인하면 완주 배지를 받아요. 중도 종료와 자유 러닝도 기록으로 남습니다.'],
  ['내 기록 공유하기', '종료 기록에서 이미지 카드를 미리 보고 저장·공유하세요. 닉네임·날짜는 기본 표시되며 끌 수 있어요. 공유 앱과 받는 사람은 기기 공유 창에서 선택합니다.'],
];
export default function ServiceGuide() {
  const c = useThemeColors();
  return <SupportPage title="이용 방법">{steps.map(([title, body], i) => <View key={title} style={{ gap: 12 }}>
    <AppText variant="heading" weight="bold">{i + 1}. {title}</AppText><AppText style={{ color: c.muted }}>{body}</AppText><GuideArt step={i} />
  </View>)}</SupportPage>;
}
