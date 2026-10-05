import { View, type ViewProps } from 'react-native';
import { radius, space } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeProvider';

export function Surface({ style, ...props }: ViewProps) {
  const c = useThemeColors();
  return <View {...props} style={[{ backgroundColor: c.surface, borderRadius: radius.card, padding: space.xl, gap: space.lg }, style]} />;
}
export function Divider({ style, ...props }: ViewProps) {
  const c = useThemeColors();
  return <View {...props} style={[{ height: 1, backgroundColor: c.divider }, style]} />;
}
