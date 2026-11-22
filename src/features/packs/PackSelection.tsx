import { useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { packCatalog, signupBenefits, type PackId } from '@/modules/packs/catalog';
import { useThemeColors } from '@/theme/ThemeProvider';
import { PackBenefits, PackCard } from './PackCard';
import { PackPage } from './PackPage';

export function PackSelection({ onBack, onHistory }: { onBack(): void; onHistory(): void }) {
  const c = useThemeColors(), [selected, setSelected] = useState<PackId>('plus');
  return <PackPage>
    <View style={{ gap: 12, alignItems: 'center' }}>
      <AppText variant="title" weight="bold" style={{ textAlign: 'center' }}>더 많이 만들고,{ '\n' }더 오래 간직하세요</AppText>
      <AppText variant="label" style={{ textAlign: 'center', color: c.muted }}>내 러닝에 맞는 팩을 미리 살펴보세요.</AppText>
    </View>
    <View style={{ padding: 18, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.navigation, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><AppText variant="heading" weight="bold">무료 혜택</AppText><AppText variant="label" style={{ color: c.selected }}>가입 최초 1회</AppText></View>
      <PackBenefits {...signupBenefits} />
      <AppText variant="caption" style={{ color: c.muted }}>매월 무료 횟수가 추가되거나 초기화되지 않아요.</AppText>
    </View>
    <View style={{ gap: 16 }}><AppText variant="heading" weight="bold">내 러닝에 맞는 팩 선택</AppText>
      {packCatalog.map(pack => <PackCard key={pack.id} pack={pack} selected={selected === pack.id} onSelect={() => setSelected(pack.id)} />)}
    </View>
    <View style={{ gap: 12 }}><AppText variant="heading" weight="bold">구매 전 안내</AppText>
      {['팩은 생성·저장 횟수를 함께 추가하는 단건 상품이에요.', '결제 기능을 준비하고 있어요. 지금은 결제되거나 횟수가 지급되지 않아요.',
        '팩을 선택해도 현재 남은 횟수는 바뀌지 않아요.', '저장 횟수는 새 코스를 저장할 수 있는 횟수예요. 보관함 공간 수와 달라요.',
        '이용 조건과 환불 안내는 구매가 가능해지기 전에 확인할 수 있어요.'].map(text => <AppText key={text} variant="caption" style={{ color: c.muted }}>• {text}</AppText>)}
    </View>
    <View style={{ gap: 10 }}>
      <Button testID="pack-purchase" label="구매 준비 중" disabled onPress={() => {}} />
      <Button testID="pack-history" label="구매 내역 보기" variant="outline" onPress={onHistory} />
      <Button testID="pack-back" label="돌아가기" variant="secondary" onPress={onBack} />
    </View>
  </PackPage>;
}
