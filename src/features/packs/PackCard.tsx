import { Image } from 'expo-image';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { formatPackPrice, type Pack } from '@/modules/packs/catalog';
import { useThemeColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

export function PackBenefits({ generation, save }: { generation: number; save: number }) {
  const c = useThemeColors(), { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  return <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 8 }}>
    {([{ kind: 'generation', label: '코스 생성', amount: generation, source: require('../../../assets/achievements/figma-20261108/wand.svg') },
      { kind: 'save', label: '코스 저장', amount: save, source: require('../../../assets/achievements/figma-20261108/archive.svg') }] as const).map(item =>
      <View key={item.kind} style={{ flex: stacked ? undefined : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, padding: 6, borderRadius: 4, backgroundColor: `${c.selected}12` }}>
        <Image source={item.source} tintColor={c.selected} style={{ width: 16, height: 16 }} accessible={false} />
        <AppText variant="caption" style={{ color: c.muted, flexShrink: 1 }}>{item.label} <AppText variant="label" weight="bold" style={{ color: c.selected }}>{item.amount}회</AppText></AppText>
      </View>)}
  </View>;
}

export function PackCard({ pack, selected = false, onSelect }: { pack: Pack; selected?: boolean; onSelect?: () => void }) {
  const c = useThemeColors();
  const content = <View style={{ gap: 4, padding: 14, borderRadius: radius.compact, borderWidth: selected ? 3 : 1, borderColor: selected ? c.selected : c.outline,
    backgroundColor: selected ? `${c.selected}0D` : c.surface }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6 }}>
      {!!onSelect && <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selected ? c.selected : c.outline, alignItems: 'center', justifyContent: 'center' }}>
        {selected && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.selected }} />}
      </View>}
      <AppText variant="heading" weight="bold" style={{ flexShrink: 1 }}>{pack.name}</AppText>
      {pack.recommended && !!onSelect && <View style={{ borderRadius: radius.pill, backgroundColor: c.action, paddingHorizontal: 10, paddingVertical: 2 }}><AppText variant="caption" weight="bold" style={{ color: c.onAction }}>추천</AppText></View>}
      <AppText variant="heading" weight="bold" style={{ marginLeft: 'auto' }}>{formatPackPrice(pack.priceKrw)}</AppText>
    </View>
    <AppText variant="caption" style={{ color: c.muted }}>{pack.description}</AppText>
    <PackBenefits generation={pack.generation} save={pack.save} />
  </View>;
  return onSelect ? <Pressable testID={`pack-${pack.id}`} accessibilityRole="radio" accessibilityLabel={`${pack.name}, ${formatPackPrice(pack.priceKrw)}, 코스 생성 ${pack.generation}회, 코스 저장 ${pack.save}회`}
    accessibilityState={{ selected, checked: selected }} aria-checked={selected} onPress={onSelect}>{content}</Pressable> : content;
}
