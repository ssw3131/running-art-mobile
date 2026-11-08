import { useEffect, useLayoutEffect, useRef, type Ref } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AchievementImage as Image } from './AchievementImage';
import { fonts } from '@/theme/tokens';
import { cardGradient, cardSize, type CardContent, type CardOptions } from '@/modules/achievements/card';

/** Fixed export canvas; screen preview scales as a bitmap after capture. */
export function ShareCard({ content, format, canvasRef, onReady, onError }: { content: CardContent; format: CardOptions['format']; canvasRef: Ref<View>; onReady(): void; onError(): void }) {
  const loaded = useRef(new Set<string>());
  const failed = useRef(false), notified = useRef(false);
  const callbacks = useRef({ onReady, onError });
  useLayoutEffect(() => { callbacks.current = { onReady, onError }; }, [onReady, onError]);
  const fail = () => { if (!failed.current) { failed.current = true; callbacks.current.onError(); } };
  useEffect(() => {
    const timeout = setTimeout(() => { if (!notified.current && !failed.current) { failed.current = true; callbacks.current.onError(); } }, 15000);
    return () => clearTimeout(timeout);
  }, []);
  const required = ['layout', 'gradient', 'runner', 'brand', 'distance', 'timer', 'pace', ...(content.pathUri ? ['path'] : [])];
  const ready = (name: string) => {
    loaded.current.add(name);
    if (!failed.current && !notified.current && required.every(key => loaded.current.has(key))) {
      notified.current = true; callbacks.current.onReady();
    }
  };
  const feed = format === 'feed';
  const metrics = [
    { id: 'distance', label: '총 거리', value: content.distance, icon: format === 'card' ? require('../../../assets/achievements/sharing/distance.svg') : require('../../../assets/achievements/distance.svg') },
    { id: 'timer', label: '활동 시간', value: content.duration, icon: format === 'card' ? require('../../../assets/achievements/sharing/timer.svg') : require('../../../assets/achievements/timer.svg') },
    { id: 'pace', label: '평균 페이스', value: content.pace, icon: format === 'card' ? require('../../../assets/achievements/sharing/pace.svg') : require('../../../assets/achievements/pace.svg') },
  ];
  if(format==='card')return <View ref={canvasRef} collapsable={false} onLayout={()=>ready('layout')} style={{width:360,height:301,backgroundColor:'#FA417F',overflow:'hidden',borderRadius:20}}>
    <Image source={{uri:cardGradient(format)}} onDisplay={()=>ready('gradient')} onError={fail} style={StyleSheet.absoluteFill}/>
    <View style={{position:'absolute',top:20,left:28,right:28,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
      <View style={{gap:3,flex:1}}>{content.nickname&&<Text allowFontScaling={false} style={{fontFamily:fonts.noto.bold,fontSize:16,color:'#111111'}}>{content.nickname}</Text>}{content.date&&<Text allowFontScaling={false} style={{fontFamily:fonts.noto.medium,fontSize:12,color:'#111111'}}>{content.date}</Text>}</View>
      <View style={{alignItems:'center'}}><Image source={require('../../../assets/achievements/brand-runner.png')} onDisplay={()=>ready('runner')} onError={fail} style={{width:54,height:27}} contentFit="cover"/><Image source={require('../../../assets/achievements/brand-name.png')} onDisplay={()=>ready('brand')} onError={fail} style={{width:54,height:14}} contentFit="contain"/></View>
    </View>
    <Text allowFontScaling={false} style={{position:'absolute',top:80,left:20,right:20,fontFamily:fonts.noto.bold,fontSize:16,textAlign:'center',color:'#FEE500'}}>{content.title} · {content.outcome.includes('완주')?'완주':'러닝 기록'}</Text>
    <View style={{position:'absolute',top:110,left:20,right:20,height:138,borderRadius:8,backgroundColor:'#F4F6FA',boxShadow:'inset 0px 0px 5px #FF6300',padding:8}}>{content.pathUri?<Image source={{uri:content.pathUri}} onDisplay={()=>ready('path')} onError={fail} style={{flex:1}} contentFit="contain"/>:<Text>저장된 경로가 없어요</Text>}</View>
    <View style={{position:'absolute',bottom:20,left:20,right:20,flexDirection:'row',gap:5}}>{metrics.map(metric=><View key={metric.id} style={{flex:1,backgroundColor:'rgba(248,249,250,0.7)',height:25,borderRadius:6,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:3,padding:4}}><Image source={metric.icon} onDisplay={()=>ready(metric.id)} onError={fail} style={{width:16,height:16}}/><Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={{fontFamily:fonts.roboto.black,fontSize:13,color:'#4F2430',flexShrink:1}}>{metric.value}</Text></View>)}</View>
  </View>;
  return <View ref={canvasRef} collapsable={false} onLayout={() => ready('layout')} style={{ width: 360, height: cardSize(format).height / 3, backgroundColor: '#FA417F' }}>
    <Image source={{ uri: cardGradient(format) }} onDisplay={() => ready('gradient')} onError={fail} style={StyleSheet.absoluteFill} />
    {(content.nickname || content.date) && <View style={{ position: 'absolute', left: 22, right: 22, top: feed ? 16 : 26, minHeight: 35, gap: 2 }}>
      {!!content.nickname && <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.noto.bold, color: '#111111', fontSize: 16 }}>{content.nickname}님</Text>}
      {!!content.date && <Text allowFontScaling={false} style={{ fontFamily: fonts.noto.medium, color: '#111111', fontSize: 12 }}>{content.date}</Text>}
    </View>}
    <View style={{ position: 'absolute', left: 22, right: 22, top: feed ? 63 : 98, gap: 2 }}>
      <Text allowFontScaling={false} style={{ fontFamily: fonts.noto.black, fontSize: feed ? 20 : 24, lineHeight: feed ? 26 : 32, color: '#FFFFFF', textAlign: 'center' }}>{content.title}</Text>
      <Text allowFontScaling={false} style={{ fontFamily: fonts.noto.black, fontSize: feed ? 18 : 22, lineHeight: feed ? 24 : 30, color: '#FFFFFF', textAlign: 'center' }}>{content.outcome}</Text>
    </View>
    <View style={{ position: 'absolute', left: 22, right: 22, top: feed ? 126 : 185, height: feed ? 120 : 150, backgroundColor: '#FFF7F2', borderRadius: 14, padding: 8, alignItems: 'center' }}>
      {content.pathUri ? <Image source={{ uri: content.pathUri }} onDisplay={() => ready('path')} onError={fail} style={{ flex: 1, width: '100%' }} contentFit="contain" />
        : <Text allowFontScaling={false} style={{ flex: 1, paddingTop: 35, fontFamily: fonts.noto.medium, color: '#757575' }}>저장된 경로가 없어요</Text>}
      <Text allowFontScaling={false} style={{ fontFamily: fonts.noto.medium, color: '#757575', fontSize: 10 }}>{content.pathLabel}</Text>
    </View>
    <View style={{ position: 'absolute', left: 22, right: 22, top: feed ? 259 : 350, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {metrics.map((metric, index) => <View key={metric.id} style={{ width: feed ? 100 : index === 2 ? '100%' : 154, minHeight: feed ? 76 : 66, backgroundColor: '#FFC2D7', borderRadius: 16, paddingHorizontal: feed ? 6 : 10, paddingVertical: 6, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Image source={metric.icon} onDisplay={() => ready(metric.id)} onError={fail} style={{ width: 20, height: 20 }} />
          <Text allowFontScaling={false} style={{ fontFamily: fonts.noto.bold, color: '#76535D', fontSize: feed ? 10 : 12 }}>{metric.label}</Text></View>
        <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.roboto.black, color: '#4F2430', fontSize: feed ? 18 : 24, textAlign: 'center' }}>{metric.value}</Text>
      </View>)}
    </View>
    <View style={{ position: 'absolute', left: 22, right: 22, bottom: feed ? 30 : 44, alignItems: 'center' }}>
      <Image source={require('../../../assets/achievements/brand-runner.png')} onDisplay={() => ready('runner')} onError={fail} style={{ width: 50, height: 25 }} contentFit="cover" />
      <Image source={require('../../../assets/achievements/brand-name.png')} onDisplay={() => ready('brand')} onError={fail} style={{ width: 71, height: 18 }} contentFit="fill" />
      {!feed && <Text allowFontScaling={false} style={{ marginTop: 5, fontFamily: fonts.noto.medium, fontSize: 10, color: '#FFFFFF' }}>RunPen과 함께 나만의 러닝아트를 만들어보세요!</Text>}
    </View>
  </View>;
}
