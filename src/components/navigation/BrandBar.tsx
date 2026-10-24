import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { useThemeColors } from '@/theme/ThemeProvider';

/** MAIN-1 305:11642. The trailing content displays server usage and the menu. */
export function BrandBar({ trailing }: { trailing: ReactNode }) {
  const c = useThemeColors();
  return <View style={{ minHeight: 80, paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, boxShadow: '0px 2px 1px rgba(0,0,0,0.1)', zIndex: 1 }}>
    <Image source={require('../../../assets/ui/runpen-logo.png')} accessibilityLabel="RunPen" style={{ width: 100, height: 33 }} contentFit="cover" />
    {trailing}
  </View>;
}
