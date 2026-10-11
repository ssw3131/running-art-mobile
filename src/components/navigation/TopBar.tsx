import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useThemeColors } from '@/theme/ThemeProvider';

/** Slots own their accessible buttons. The screen owns navigation and safe-area top padding. */
export function TopBar({ title, leading, trailing }: { title: string; leading?: ReactNode; trailing?: ReactNode }) {
  const c = useThemeColors();
  return <View style={{ minHeight: 80, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 21, paddingVertical: 10, backgroundColor: c.surface, gap: 12, boxShadow: '0px 2px 1px rgba(0,0,0,0.1)', zIndex: 1 }}>
    <View style={{ width: 48, alignItems: 'center' }}>{leading}</View>
    <AppText accessibilityRole="header" variant="title" weight="bold" style={{ flex: 1, textAlign: 'center', paddingTop: 3 }}>{title}</AppText>
    <View style={{ width: 48, alignItems: 'center' }}>{trailing}</View>
  </View>;
}
