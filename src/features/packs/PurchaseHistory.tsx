import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useThemeColors } from '@/theme/ThemeProvider';
import { PackPage } from './PackPage';

export function PurchaseHistory({ onPacks, onSupport }: { onPacks(): void; onSupport(): void }) {
  const c = useThemeColors();
  return <PackPage>
    <View style={{ gap: 12 }}><AppText variant="title" weight="bold">구매 내역</AppText><AppText variant="label" style={{ color: c.muted }}>RunPen에서 구매한 팩과 적용 내역을 확인하는 곳이에요.</AppText></View>
    <Button testID="history-packs" label="팩 살펴보기" onPress={onPacks} />
    <View style={{ gap: 16 }}><AppText variant="heading" weight="bold">구매 기록</AppText>
      <View testID="purchase-history-preparing" style={{ borderWidth: 1, borderColor: c.outline, borderRadius: 10, padding: 24, gap: 12 }}>
        <AppText variant="heading" weight="bold">구매 내역 연결 준비 중</AppText>
        <AppText variant="label" style={{ color: c.muted }}>결제 기능을 연결한 뒤 확인된 구매 기록과 적용 내역을 보여드릴게요.</AppText>
      </View>
    </View>
    <View style={{ backgroundColor: c.navigation, borderRadius: 20, padding: 20, gap: 12 }}>
      <AppText weight="bold">이용 관련 도움이 필요하신가요?</AppText>
      <AppText variant="label" style={{ color: c.muted }}>앱의 고객문의에서 문의하고 답변을 확인할 수 있어요.</AppText>
      <Button testID="history-support" label="고객문의" variant="outline" onPress={onSupport} />
    </View>
  </PackPage>;
}
