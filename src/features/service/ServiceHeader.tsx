import { router, usePathname, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { TopBar } from '@/components/navigation/TopBar';
import { BrandBar } from '@/components/navigation/BrandBar';
import { Icon } from '@/components/ui/Icon';
import { UsagePanel } from '@/features/usage/UsagePanel';

export function ServiceHeader({ title, back = false, brand = false, menu = true }: { title: string; back?: boolean; brand?: boolean; menu?: boolean }) {
  const path = usePathname();
  const fallback = useCallback(() => router.replace({ pathname: '/courses', params: { view: path.startsWith('/runs/') || path === '/run-result' ? 'runs' : 'courses' } }), [path]);
  useFocusEffect(useCallback(() => {
    if (!back) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false;
      if (path.startsWith('/courses/') || path.startsWith('/runs/') || path === '/course-candidate' || path === '/run-result') {
        if (path === '/course-candidate') router.replace('/route-lab'); else fallback();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [back, path, fallback]));
  const trailing = menu ? <Pressable testID="service-menu" accessibilityRole="button" accessibilityLabel="서비스 안내 메뉴"
    onPress={() => router.push('/service-info')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="menu" /></Pressable> : undefined;
  if (brand) return <BrandBar trailing={<View style={{flexDirection:'row',alignItems:'center',gap:8,flexShrink:1}}><UsagePanel compact/>{trailing}</View>} />;
  return <TopBar title={title} trailing={trailing} leading={back ? <Pressable testID="service-back" accessibilityRole="button" accessibilityLabel="뒤로"
    onPress={() => {
      if (router.canGoBack()) router.back();
      else if (path === '/course-candidate') router.replace('/route-lab');
      else if (path.startsWith('/courses/') || path.startsWith('/runs/') || path === '/run-result') fallback();
      else router.replace('/');
    }} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevronLeft" /></Pressable> : undefined} />;
}
