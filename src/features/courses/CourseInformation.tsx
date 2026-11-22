import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useThemeColors } from '@/theme/ThemeProvider';

const assets = {
  flag: require('../../../assets/generation/figma-20261107-detail/flag.svg'),
  edit: require('../../../assets/generation/figma-20261107-detail/edit.svg'),
  pin: require('../../../assets/generation/figma-20261107-detail/pin.svg'),
  map: require('../../../assets/generation/figma-20261107-detail/map.svg'),
  watch: require('../../../assets/generation/figma-20261107-detail/watch.svg'),
  difficulty: require('../../../assets/generation/figma-20261107-detail/difficulty.svg'),
  slope: require('../../../assets/generation/figma-20261107-detail/slope.svg'),
  clip: require('../../../assets/generation/figma-20261107-detail/clip.svg'),
  down: require('../../../assets/generation/figma-20261107-detail/down.svg'),
};
export function DetailIcon({ name }: { name: keyof typeof assets }) {
  return <Image source={assets[name]} style={{ width: 16, height: 16 }} accessible={false} contentFit="contain" />;
}
export function courseDuration(minutes: number) {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:00`;
}
export function InformationRow({ icon, label, children }: { icon: keyof typeof assets; label: string; children: ReactNode }) {
  const c = useThemeColors();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, minHeight: 26 }}>
    <View style={{ width: 90, flexDirection: 'row', alignItems: 'center', gap: 10 }}><DetailIcon name={icon} /><AppText weight="bold" style={{ color: c.subtle, fontSize: 16 }}>{label}</AppText></View>
    <View style={{ flex: 1 }}>{children}</View>
  </View>;
}
export function CourseInformation({ name, address, distance, minutes, onEdit, editor }: {
  name: string; address: string; distance: number; minutes: number;
  onEdit(): void; editor?: ReactNode;
}) {
  return <View style={{ gap: 17 }}>
    <InformationRow icon="flag" label="코스명"><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><AppText weight="bold" style={{ flexShrink: 1 }}>{name}</AppText><Pressable testID="course-edit-name" accessibilityRole="button" accessibilityLabel="코스 이름 수정" onPress={onEdit} hitSlop={16}><DetailIcon name="edit" /></Pressable></View></InformationRow>
    {editor}
    <InformationRow icon="pin" label="출발지"><AppText weight="bold">{address}</AppText></InformationRow>
    <InformationRow icon="map" label="전체 거리"><AppText weight="bold">{distance.toFixed(2)} km</AppText></InformationRow>
    <InformationRow icon="watch" label="예상 시간"><AppText weight="bold">{courseDuration(minutes).replaceAll(':', ' : ')}</AppText></InformationRow>

  </View>;
}
