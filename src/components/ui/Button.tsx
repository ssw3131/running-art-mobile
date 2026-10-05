import type { ReactNode, Ref } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, size, type FontFamily } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

export type ButtonProps = {
  label: string; onPress(): void; variant?: 'primary' | 'secondary' | 'outline';
  compact?: boolean; disabled?: boolean; loading?: boolean; family?: FontFamily;
  leading?: ReactNode; trailing?: ReactNode; testID?: string; style?: StyleProp<ViewStyle>;
  ref?: Ref<View>;
};
export function Button({ label, onPress, variant = 'primary', compact = false, disabled = false, loading = false, family = 'noto', leading, trailing, testID, style, ref }: ButtonProps) {
  const c = useThemeColors();
  const blocked = disabled || loading;
  const primary = variant === 'primary';
  const color = primary ? c.onAction : variant === 'secondary' || compact ? c.muted : c.outlineText;
  return <Pressable ref={ref} accessible testID={testID} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: blocked, busy: loading }} disabled={blocked} onPress={onPress}
    style={({ pressed }) => [{ minHeight: size.touch, justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }, style]}>
    <View style={{ minHeight: compact ? size.popupButton : primary ? size.button : size.secondaryButton,
      paddingHorizontal: 20, paddingVertical: compact ? 5 : 10, borderRadius: compact ? radius.compact : variant === 'outline' ? radius.outline : radius.button,
      backgroundColor: primary ? compact ? c.selected : c.action : variant === 'secondary' ? c.secondary : c.surface,
      borderWidth: variant === 'outline' ? compact ? 1 : 1.5 : 0, borderColor: c.outline,
      flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
      {loading ? <ActivityIndicator color={color} /> : leading}
      <AppText family={family} weight="bold" variant={compact ? 'label' : primary ? 'heading' : 'body'} style={{ color, textAlign: 'center', flexShrink: 1 }}>{label}</AppText>
      {!loading && trailing}
    </View>
  </Pressable>;
}

export function IconButton({ label, children, onPress, disabled = false, testID }: { label: string; children: ReactNode; onPress(): void; disabled?: boolean; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} testID={testID}
    style={({ pressed }) => ({ minWidth: size.touch, minHeight: size.touch, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}>
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View>
  </Pressable>;
}
