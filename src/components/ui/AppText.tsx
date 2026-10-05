import { Text, type TextProps } from 'react-native';
import { fonts, typography, type FontFamily, type FontWeight } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeProvider';

export type AppTextProps = TextProps & { variant?: keyof typeof typography; family?: FontFamily; weight?: FontWeight };
/** Choose Roboto explicitly for design-approved runs; never infer it from characters. */
export function AppText({ variant = 'body', family = 'noto', weight = 'regular', style, ...props }: AppTextProps) {
  const c = useThemeColors();
  return <Text {...props} style={[{ color: c.text, ...typography[variant], fontFamily: fonts[family][weight], includeFontPadding: false }, style]} />;
}
