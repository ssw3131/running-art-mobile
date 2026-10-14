import { Image } from 'expo-image';
import { View } from 'react-native';

/** Original Figma sprite cropped to illustrations, excluding sample interface/text. */
export function SupportArt({ kind }: { kind: 'about' | 'inquiry' | 'notice' }) {
  const rect = kind === 'about' ? { x: 16, y: 360, w: 239, h: 200 } : kind === 'inquiry' ? { x: 807, y: 199, w: 222, h: 159 } : { x: 1064, y: 199, w: 218, h: 159 };
  return <View accessible={false} style={{ width: '100%', aspectRatio: rect.w / rect.h, borderRadius: 20, overflow: 'hidden' }}>
    <Image source={require('../../../assets/support/scenes.png')} accessible={false} contentFit="fill"
      style={{ position: 'absolute', width: `${1536 / rect.w * 100}%`, height: `${1024 / rect.h * 100}%`, left: `${-rect.x / rect.w * 100}%`, top: `${-rect.y / rect.h * 100}%` }} />
  </View>;
}
export function GuideArt({ step }: { step: number }) {
  const rect = [{ y: 0, h: 450 }, { y: 463, h: 365 }, { y: 847, h: 431 }, { y: 1294, h: 338 }, { y: 1646, h: 386 }][step];
  return <View accessible={false} style={{ width: '100%', aspectRatio: 696 / rect.h, borderRadius: 20, overflow: 'hidden' }}>
    <Image source={require('../../../assets/support/guide-scenes.png')} accessible={false} contentFit="fill"
      style={{ position: 'absolute', width: '100%', height: `${2048 / rect.h * 100}%`, top: `${-rect.y / rect.h * 100}%` }} />
  </View>;
}
