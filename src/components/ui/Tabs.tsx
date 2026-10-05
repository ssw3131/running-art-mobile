import { Pressable, View } from 'react-native';
import { size } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

export type TabOption = { value: string; label: string; disabled?: boolean };
export function Tabs({ options, value, onChange }: { options: readonly TabOption[]; value: string; onChange(value: string): void }) {
  const c = useThemeColors();
  return <View style={{ flexDirection: 'row', borderBottomColor: c.divider, borderBottomWidth: 1 }}>
    {options.map(option => { const active = value === option.value; return <Pressable key={option.value} accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled: !!option.disabled }} disabled={option.disabled} onPress={() => onChange(option.value)}
      style={({ pressed }) => ({ flex: 1, minHeight: size.touch, gap: 8, paddingTop: 8, alignItems: 'center', justifyContent: 'flex-end', opacity: option.disabled ? 0.45 : pressed ? 0.7 : 1 })}>
      <AppText weight={active ? 'bold' : 'medium'} style={{ fontSize: active ? 18 : 17, color: active ? c.selected : c.inactive, textAlign: 'center' }}>{option.label}</AppText>
      <View style={{ height: 3.5, borderRadius: 2, width: 80, maxWidth: '90%', backgroundColor: active ? c.selected : 'transparent' }} />
    </Pressable>; })}
  </View>;
}
