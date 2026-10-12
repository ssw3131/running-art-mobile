import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { TopBar } from '@/components/navigation/TopBar';
import { BrandBar } from '@/components/navigation/BrandBar';
import { Icon } from '@/components/ui/Icon';

export function ServiceHeader({ title, back = false, brand = false, menu = true }: { title: string; back?: boolean; brand?: boolean; menu?: boolean }) {
  const trailing = menu ? <Pressable testID="service-menu" accessibilityRole="button" accessibilityLabel="서비스 안내 메뉴"
    onPress={() => router.push('/service-info')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="menu" /></Pressable> : undefined;
  if (brand) return <BrandBar trailing={trailing} />;
  return <TopBar title={title} trailing={trailing} leading={back ? <Pressable testID="service-back" accessibilityRole="button" accessibilityLabel="뒤로"
    onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevronLeft" /></Pressable> : undefined} />;
}
