import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useThemeColors } from '@/theme/ThemeProvider';

/** Slots own their accessible buttons. The screen owns navigation and safe-area top padding. */
export function TopBar({ title, leading, trailing }: { title: string; leading?: ReactNode; trailing?: ReactNode }) {
  const c = useThemeColors();
  return <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: c.surface, gap: 8 }}>
    <View style={{ minWidth: 48 }}>{leading}</View>
    <AppText accessibilityRole="header" variant="heading" weight="bold" style={{ flex: 1, textAlign: 'center' }}>{title}</AppText>
    <View style={{ minWidth: 48 }}>{trailing}</View>
  </View>;
}
