import type { PropsWithChildren } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/theme/ThemeProvider';

export function PackPage({ children }: PropsWithChildren) {
  const c = useThemeColors(), insets = useSafeAreaInsets(), { width } = useWindowDimensions();
  return <ScrollView testID="pack-scroll" style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ width: '100%', maxWidth: 680, alignSelf: 'center',
    paddingHorizontal: width < 360 ? 24 : 32, paddingTop: 40, paddingBottom: Math.max(32, insets.bottom + 20), gap: 28 }}>{children}</ScrollView>;
}
