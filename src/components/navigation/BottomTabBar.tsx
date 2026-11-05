import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useThemeColors } from '@/theme/ThemeProvider';

export type NavigationTab = { value: string; label: string; icon: IconName; disabled?: boolean };
export const runPenTabs: readonly NavigationTab[] = [
  { value: 'home', label: '홈', icon: 'home' }, { value: 'courses', label: '코스 생성', icon: 'map' },
  { value: 'run', label: '실시간 러닝', icon: 'run' }, { value: 'archive', label: '보관함', icon: 'archive' },
  { value: 'account', label: '마이페이지', icon: 'user' },
];
/** Presentation only. Caller supplies the bottom inset and handles route changes. */
export function BottomTabBar({ value, onChange, tabs = runPenTabs, bottomInset = 0 }: { value: string; onChange(value: string): void; tabs?: readonly NavigationTab[]; bottomInset?: number }) {
  const c = useThemeColors();
  // Keep the whole bar at Figma's 90dp when the system inset allows it.
  const bottomPadding = Math.max(16, bottomInset);
  const rowHeight = Math.max(50, 90 - 11 - bottomPadding);
  return <View style={{ backgroundColor: c.navigation, paddingTop: 11, paddingBottom: bottomPadding, paddingHorizontal: 30 }}>
    <View style={{ flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between', height: rowHeight }}>
      {tabs.map(tab => {
        const color = value === tab.value ? c.selected : c.muted;
        return (
          <Pressable key={tab.value} testID={`tab-${tab.value}`} accessibilityRole="tab" accessibilityLabel={tab.label}
            accessibilityState={{ selected: value === tab.value, disabled: !!tab.disabled }} disabled={tab.disabled} onPress={() => onChange(tab.value)}
            style={({ pressed }) => ({ flex: 1, minHeight: 50, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', gap: 5, opacity: tab.disabled ? 0.45 : pressed ? 0.7 : 1 })}>
            <Icon name={tab.icon} color={color} />
            <AppText variant="navigation" weight="bold" style={{ color, textAlign: 'center', width: '100%' }}>{tab.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  </View>;
}
