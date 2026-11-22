import { View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import type { ConfirmedPackPurchase } from '@/modules/packs/catalog';
import { useThemeColors } from '@/theme/ThemeProvider';
import { PackCard } from './PackCard';
import { PackPage } from './PackPage';

/** Presentation only. Intentionally has no route, verifier, side effects or allowance dependency. */
export function PackPurchaseComplete({ purchase, onHistory, onCreate, onSaved }: {
  purchase: ConfirmedPackPurchase; onHistory(): void; onCreate(): void; onSaved(): void;
}) {
  const c = useThemeColors(), { width, fontScale } = useWindowDimensions();
  const pack = purchase.pack;
  const stacked = width < 390 || fontScale > 1.3;
  return <PackPage>
    <View style={{ gap: 12, alignItems: 'center' }}>
      <AppText variant="title" weight="bold" style={{ textAlign: 'center' }}><AppText variant="title" weight="bold" style={{ color: c.selected }}>새로운 팩</AppText>이{ '\n' }적용됐어요!</AppText>
      <AppText variant="label" style={{ color: c.muted, textAlign: 'center' }}>이제 더 많은 코스를 만들고,{ '\n' }오래 간직할 수 있어요.</AppText>
    </View>
    <PackCard pack={pack} selected />
    <View style={{ gap: 16 }}><AppText variant="heading" weight="bold">새롭게 늘어난 혜택</AppText>
      <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 16 }}>
        {([{ key: 'generation', label: '코스 생성', count: pack.generation }, { key: 'save', label: '코스 저장', count: pack.save }] as const).map(item =>
          <View key={item.key} style={{ flex: stacked ? undefined : 1, paddingVertical: 20, paddingHorizontal: 12, borderRadius: 10, backgroundColor: `${c.selected}12`, gap: 8, alignItems: 'center' }}>
            <AppText weight="bold">{item.label} 횟수</AppText><AppText testID={`purchase-added-${item.key}`} variant="metric" weight="bold" style={{ fontSize: 48, lineHeight: 60, color: c.selected, textAlign: 'center' }}>+{item.count}<AppText>회</AppText></AppText>
          </View>)}
      </View>
    </View>
    <View style={{ gap: 10 }}><Button label="구매 내역 확인" variant="outline" onPress={onHistory} /><Button label="새 코스 만들기" onPress={onCreate} /><Button label="저장한 코스 보러가기" variant="outline" onPress={onSaved} /></View>
  </PackPage>;
}
