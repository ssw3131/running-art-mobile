import { useRef, type Ref } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { fonts } from '@/theme/tokens';
import { cardGradient, cardSize, type CardContent, type CardOptions } from '@/modules/achievements/card';

/** Fixed export canvas; screen preview scales as a bitmap after capture. */
export function ShareCard({ content, format, canvasRef, onReady, onError }: { content: CardContent; format: CardOptions['format']; canvasRef: Ref<View>; onReady(): void; onError(): void }) {
  const loaded = useRef(new Set<string>());
  const required = ['layout', 'gradient', 'runner', 'brand', 'distance', 'timer', 'pace', ...(content.pathUri ? ['path'] : [])];
  const ready = (name: string) => { loaded.current.add(name); if (required.every(key => loaded.current.has(key))) onReady(); };
  const feed = format === 'feed';
  const metrics = [
    { id: 'distance', label: '총 거리', value: content.distance, icon: require('../../../assets/achievements/distance.svg') },
    { id: 'timer', label: '활동 시간', value: content.duration, icon: require('../../../assets/achievements/timer.svg') },
    { id: 'pace', label: '평균 페이스', value: content.pace, icon: require('../../../assets/achievements/pace.svg') },
  ];
  return <View ref={canvasRef} collapsable={false} onLayout={() => ready('layout')} style={{ width: 360, height: cardSize(format).height / 3, backgroundColor: '#FA417F' }}>
    <Image source={{ uri: cardGradient(format) }} onLoad={() => ready('gradient')} onError={onError} style={StyleSheet.absoluteFill} />
    {(content.nickname || content.date) && <View style={{ position: 'absolute', left: 22, right: 22, top: feed ? 16 : 26, minHeight: 35, gap: 2 }}>
      {!!content.nickname && <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.noto.bold, color: '#111111', fontSize: 16 }}>{content.nickname}님</Text>}
      {!!content.date && <Text allowFontScaling={false} style={{ fontFamily: fonts.noto.medium, color: '#111111', fontSize: 12 }}>{content.date}</Text>}
    </View>}
    <View style={{ position: 'absolute', left: 22, right: 22, top: feed ? 63 : 98, gap: 2 }}>
      <Text allowFontScaling={false} style={{ fontFamily: fonts.noto.black, fontSize: feed ? 20 : 24, lineHeight: feed ? 26 : 32, color: '#FFFFFF', textAlign: 'center' }}>{content.title}</Text>
      <Text allowFontScaling={false} style={{ fontFamily: fonts.noto.black, fontSize: feed ? 18 : 22, lineHeight: feed ? 24 : 30, color: '#FFFFFF', textAlign: 'center' }}>{content.outcome}</Text>
    </View>
    <View style={{ position: 'absolute', left: 22, right: 22, top: feed ? 126 : 185, height: feed ? 120 : 150, backgroundColor: '#FFF7F2', borderRadius: 14, padding: 8, alignItems: 'center' }}>
      {content.pathUri ? <Image source={{ uri: content.pathUri }} onLoad={() => ready('path')} onError={onError} style={{ flex: 1, width: '100%' }} contentFit="contain" />
        : <Text allowFontScaling={false} style={{ flex: 1, paddingTop: 35, fontFamily: fonts.noto.medium, color: '#757575' }}>저장된 경로가 없어요</Text>}
      <Text allowFontScaling={false} style={{ fontFamily: fonts.noto.medium, color: '#757575', fontSize: 10 }}>{content.pathLabel}</Text>
    </View>
    <View style={{ position: 'absolute', left: 22, right: 22, top: feed ? 259 : 350, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {metrics.map((metric, index) => <View key={metric.id} style={{ width: feed ? 100 : index === 2 ? '100%' : 154, minHeight: feed ? 76 : 66, backgroundColor: '#FFC2D7', borderRadius: 16, paddingHorizontal: feed ? 6 : 10, paddingVertical: 6, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Image source={metric.icon} onLoad={() => ready(metric.id)} onError={onError} style={{ width: 20, height: 20 }} />
          <Text allowFontScaling={false} style={{ fontFamily: fonts.noto.bold, color: '#76535D', fontSize: feed ? 10 : 12 }}>{metric.label}</Text></View>
        <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.roboto.black, color: '#4F2430', fontSize: feed ? 18 : 24, textAlign: 'center' }}>{metric.value}</Text>
      </View>)}
    </View>
    <View style={{ position: 'absolute', left: 22, right: 22, bottom: feed ? 30 : 44, alignItems: 'center' }}>
      <Image source={require('../../../assets/achievements/brand-runner.png')} onLoad={() => ready('runner')} onError={onError} style={{ width: 50, height: 25 }} contentFit="cover" />
      <Image source={require('../../../assets/achievements/brand-name.png')} onLoad={() => ready('brand')} onError={onError} style={{ width: 71, height: 18 }} contentFit="fill" />
      {!feed && <Text allowFontScaling={false} style={{ marginTop: 5, fontFamily: fonts.noto.medium, fontSize: 10, color: '#FFFFFF' }}>RunPen과 함께 나만의 러닝아트를 만들어보세요!</Text>}
    </View>
  </View>;
}
