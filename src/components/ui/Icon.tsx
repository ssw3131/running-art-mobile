import { Image } from 'expo-image';

const assets = {
  chevronDown: { source: require('../../../assets/ui/chevron-down.svg'), width: 20, height: 20 },
  chevronRight: { source: require('../../../assets/ui/chevron-right.svg'), width: 32, height: 28 },
  share: { source: require('../../../assets/ui/share.svg'), width: 21.5, height: 20.666 },
  home: { source: require('../../../assets/ui/home.svg'), width: 20, height: 20 },
  map: { source: require('../../../assets/ui/map.svg'), width: 20, height: 20 },
  run: { source: require('../../../assets/ui/run.svg'), width: 20, height: 20 },
  archive: { source: require('../../../assets/ui/archive.svg'), width: 20, height: 20 },
  user: { source: require('../../../assets/ui/user.svg'), width: 20, height: 20 },
  switchOff: { source: require('../../../assets/ui/switch-off.svg'), width: 50, height: 24 },
} as const;
export type IconName = keyof typeof assets;
export function Icon({ name }: { name: IconName }) {
  const asset = assets[name];
  return <Image source={asset.source} style={{ width: asset.width, height: asset.height }} contentFit="contain" accessible={false} />;
}
