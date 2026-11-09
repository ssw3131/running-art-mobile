import { useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { AchievementImage as Image } from './AchievementImage';
import { fonts } from '@/theme/tokens';
import { cardGradient, type CardContent } from '@/modules/achievements/card';

export function PlatformShareCard({content,portrait,canvasRef,onReady,onError}:{content:CardContent;portrait:boolean;canvasRef:Ref<View>;onReady():void;onError():void}){
 const [avatarFailed,setAvatarFailed]=useState(false);
 const loaded=useRef(new Set<string>()),failed=useRef(false),notified=useRef(false),callbacks=useRef({onReady,onError});
 useLayoutEffect(()=>{callbacks.current={onReady,onError};},[onReady,onError]);
 const avatar=!!content.avatarUri&&!avatarFailed;
 const required=['layout','gradient',...(portrait&&content.compactHeader?[]:['runner','brand']),...(content.mapUri||content.pathUri?['path']:[]),...(avatar?['avatar']:[])];
 const ready=(id:string)=>{loaded.current.add(id);if(!failed.current&&!notified.current&&required.every(k=>loaded.current.has(k))){notified.current=true;callbacks.current.onReady();}};
 const fail=()=>{if(!failed.current){failed.current=true;callbacks.current.onError();}};
 useEffect(()=>{const timer=setTimeout(()=>{if(!notified.current&&!failed.current){failed.current=true;callbacks.current.onError();}},15000);return()=>clearTimeout(timer);},[]);
 const compact=portrait&&content.compactHeader;
 const header={left:portrait?24.6:18.2,right:portrait?24.6:26.2,top:portrait?24.6:18.2};
 const photo=portrait?55.4:47.8,brandW=portrait?67.7:66,brandH=brandW*35/58;
 const map={left:portrait?24.6:18.2,right:portrait?24.6:18.2,top:portrait?209.2:132.2,height:portrait?286.2:159.5};
 const text=(size:number)=>({fontFamily:fonts.noto.regular,fontSize:size,lineHeight:size*1.35,includeFontPadding:false,color:'#FFFFFF'});
 const metrics=[['거리',content.distance],['시간',content.duration.replace(/^00:/,'')],['페이스',content.pace],['칼로리',content.calories??'— kcal']];
 return <View ref={canvasRef} testID="share-export-canvas" collapsable={false} onLayout={()=>ready('layout')} style={{width:360,height:portrait?640:360,borderRadius:16,overflow:'hidden',backgroundColor:'#FC3F80'}}>
  <Image source={{uri:cardGradient(portrait?'story':'square')}} onDisplay={()=>ready('gradient')} onError={fail} style={StyleSheet.absoluteFill}/>
  <View style={{position:'absolute',...header,flexDirection:'row',alignItems:'center',gap:portrait?6.2:8}}>
   <View style={{width:photo,height:photo,borderRadius:photo/2,overflow:'hidden',backgroundColor:'#FFE5D3',alignItems:'center',justifyContent:'center'}}>
    {avatar?<Image source={{uri:content.avatarUri}} onDisplay={()=>ready('avatar')} onError={()=>{setAvatarFailed(true);ready('avatar');}} style={{width:photo,height:photo}} contentFit="cover"/>:<Text allowFontScaling={false} style={{includeFontPadding:false,lineHeight:photo*.55,fontFamily:fonts.noto.bold,fontSize:photo*.42,color:'#FC5602'}}>{[...(content.nickname??'R')][0]}</Text>}
   </View>
   <View style={{flex:1,gap:1}}><Text allowFontScaling={false} numberOfLines={1} style={[text(portrait?compact?16:18.5:14.8),{fontFamily:fonts.noto.bold}]}>{content.nickname??'러너'}님</Text>
    {!!content.date&&<Text allowFontScaling={false} style={text(portrait?compact?11:12.3:11.4)}>{content.date}</Text>}
    {!!content.address&&!compact&&<Text allowFontScaling={false} numberOfLines={1} style={text(portrait?12.3:11.4)}>{content.address}</Text>}
   </View>
   {compact?<Text allowFontScaling={false} style={{includeFontPadding:false,lineHeight:22,fontFamily:fonts.noto.bold,fontSize:16,color:'#FFFFFF'}}>RunPen</Text>:<View style={{width:brandW,height:brandH,alignItems:'center'}}><Image source={require('../../../assets/achievements/brand-runner.png')} onDisplay={()=>ready('runner')} onError={fail} style={{width:(brandH-brandW*18/71)*2,height:brandH-brandW*18/71}} contentFit="cover"/><Image source={require('../../../assets/achievements/brand-name.png')} onDisplay={()=>ready('brand')} onError={fail} style={{width:brandW,height:brandW*18/71}} contentFit="contain"/></View>}
  </View>
  <Text allowFontScaling={false} numberOfLines={2} adjustsFontSizeToFit style={{position:'absolute',left:portrait?24.6:18.2,right:18.2,top:portrait?144.6:95.7,includeFontPadding:false,fontFamily:fonts.noto.bold,fontSize:portrait?33.8:20.5,lineHeight:portrait?44:30,textAlign:portrait?'left':'center',color:'white'}}>{content.title.replace(' 코스','코스')} {content.outcome.includes('완주')?'완주':'러닝 기록'}</Text>
  <View style={{position:'absolute',...map,borderRadius:9,overflow:'hidden',backgroundColor:'#F0F4F3'}}>
   {content.mapUri||content.pathUri?<Image source={{uri:content.mapUri??content.pathUri!}} onDisplay={()=>ready('path')} onError={fail} contentFit={content.mapUri?'cover':'contain'} style={StyleSheet.absoluteFill}/>:<Text style={{padding:12}}>저장된 경로가 없어요</Text>}
   {content.mapCredits&&<Text allowFontScaling={false} style={{position:'absolute',bottom:0,right:3,fontSize:6,color:'#51565B',backgroundColor:'#FFFFFFCC'}}>© MapTiler © OpenStreetMap</Text>}
  </View>
  <View style={{position:'absolute',left:portrait?24.6:22.8,right:portrait?24.6:18.2,top:portrait?540:302.3,height:portrait?70.8:35.3,borderRadius:10,backgroundColor:'#FFFFFF',flexDirection:'row',alignItems:'center'}}>
   {metrics.map(([label,value])=><View key={label} style={{flex:1,alignItems:'center',gap:portrait?4:1}}><Text allowFontScaling={false} style={{includeFontPadding:false,fontFamily:fonts.noto.regular,fontSize:portrait?12.3:9.1,lineHeight:portrait?18:12,color:'#77777F'}}>{label}</Text><Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={{includeFontPadding:false,fontFamily:fonts.noto.bold,fontSize:portrait?15.4:11.4,lineHeight:portrait?22:16,color:'#26262C'}}>{value}</Text></View>)}
  </View>
 </View>;
}
