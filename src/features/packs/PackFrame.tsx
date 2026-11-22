import { useCallback, type PropsWithChildren } from 'react';
import { BackHandler, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { TopBar } from '@/components/navigation/TopBar';
import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { openServiceTab } from '@/features/service/open-service-tab';
import { serviceTabs } from '@/features/service/navigation';
import { useThemeColors } from '@/theme/ThemeProvider';

export function backFromPacks() {
  if (router.canGoBack()) router.back();
  else router.replace('/account');
}

/** Shared route shell; no membership, usage or payment requests. */
export function PackFrame({ title, children }: PropsWithChildren<{ title: string }>) {
  const c = useThemeColors(), insets = useSafeAreaInsets();
  useFocusEffect(useCallback(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false;
      router.replace('/account');
      return true;
    });
    return () => handler.remove();
  }, []));
  return <View style={{ flex: 1, backgroundColor: c.background }}>
    <Stack.Screen options={{ title, header: () => <TopBar title={title} leading={<IconButton testID="service-back" label="뒤로" onPress={backFromPacks}><Icon name="chevronLeft" /></IconButton>} /> }} />
    {children}
    <BottomTabBar value="account" bottomInset={insets.bottom} onChange={value => {
      const tab = serviceTabs.find(item => item.value === value);
      if (tab) openServiceTab(tab.href);
    }} />
  </View>;
}
