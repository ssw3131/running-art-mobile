import { Image } from 'expo-image';
import { View } from 'react-native';
import { useThemeColors } from '@/theme/ThemeProvider';

const assets = {
  chevronDown: { source: require('../../../assets/ui/chevron-down.svg'), width: 20, height: 20 },
  chevronLeft: { source: require('../../../assets/ui/chevron-left.svg'), width: 30, height: 30 },
  menu: { source: require('../../../assets/ui/menu.svg'), width: 24, height: 24 },
  logout: { source: require('../../../assets/ui/logout.svg'), width: 16, height: 16 },
  checkboxOn: { source: require('../../../assets/ui/checkbox-on.svg'), width: 24, height: 24 },
  chevronRight: { source: require('../../../assets/ui/chevron-right.svg'), width: 32, height: 28 },
  share: { source: require('../../../assets/ui/share.svg'), width: 21.5, height: 20.666 },
  home: { source: require('../../../assets/ui/home.svg'), width: 20, height: 20 },
  map: { source: require('../../../assets/ui/map.svg'), width: 20, height: 20 },
  run: { source: require('../../../assets/ui/run.svg'), width: 20, height: 20 },
  archive: { source: require('../../../assets/ui/archive.svg'), width: 20, height: 20 },
  user: { source: require('../../../assets/ui/user.svg'), width: 20, height: 20 },
  switchOff: { source: require('../../../assets/ui/switch-off.svg'), width: 50, height: 24 },
  switchOn: { source: require('../../../assets/ui/switch-on.svg'), width: 50, height: 24 },
} as const;
export type IconName = keyof typeof assets;
export function Icon({ name, color }: { name: IconName; color?: string }) {
  const c = useThemeColors();
  const asset = assets[name];
  // Figma's 18dp share slot contains an overflowing, unscaled original SVG.
  if (name === 'share') return <View accessible={false} style={{ width: 18, height: 18 }}>
    <Image source={asset.source} style={{ position: 'absolute', left: -2.5, top: -5 / 3, width: asset.width, height: asset.height }} contentFit="contain" accessible={false} />
  </View>;
  return <Image source={asset.source} tintColor={color ?? (c.background === '#121212' && !['switchOn', 'switchOff', 'checkboxOn'].includes(name) ? c.text : undefined)} style={{ width: asset.width, height: asset.height }} contentFit="contain" accessible={false} />;
}
