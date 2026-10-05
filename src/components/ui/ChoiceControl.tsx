import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { size } from '@/theme/tokens';
import { AppText } from './AppText';

export type ChoiceControlProps = {
  label: string; checked: boolean; onChange(checked: boolean): void; disabled?: boolean; testID?: string;
  /** Both original state assets are required; never substitute an unrelated system glyph. */
  visuals: { on: ReactNode; off: ReactNode };
};
function ChoiceControl({ label, checked, onChange, disabled = false, testID, visuals, role }: ChoiceControlProps & { role: 'checkbox' | 'switch' }) {
  return <Pressable testID={testID} accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ checked, disabled }}
    disabled={disabled} onPress={() => onChange(!checked)}
    style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: size.touch, minWidth: size.touch, flexDirection: 'row', alignItems: 'center', gap: role === 'switch' ? 7 : 8, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}>
    {role === 'switch' && <AppText weight="bold" style={{ fontSize: 15, flexShrink: 1 }}>{label}</AppText>}
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: role === 'switch' ? 50 : 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>{checked ? visuals.on : visuals.off}</View>
    {role === 'checkbox' && <AppText style={{ flexShrink: 1 }}>{label}</AppText>}
  </Pressable>;
}
export function Checkbox(props: ChoiceControlProps) { return <ChoiceControl {...props} role="checkbox" />; }
export function Toggle(props: ChoiceControlProps) { return <ChoiceControl {...props} role="switch" />; }
