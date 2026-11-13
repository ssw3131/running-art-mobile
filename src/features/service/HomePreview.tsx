import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { homePathSvg, type HomePath } from '@/modules/home/model';
import { mapStyleUrl, themedMapStyle } from '@/modules/map/config';
import { useThemeColors } from '@/theme/ThemeProvider';
import { homeThumbnail } from './home-thumbnail';
const baseStyle=mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY);
export const HomePreview=memo(function HomePreview({paths,active,label,unavailable=false,synthetic=false}:{paths:HomePath[];active:boolean;label:string;unavailable?:boolean;synthetic?:boolean}){
  const c=useThemeColors(),signature=JSON.stringify(paths),stable=useMemo(()=>JSON.parse(signature) as HomePath[],[signature]);
  const drawing=useMemo(()=>homePathSvg(stable,c.selected),[stable,c.selected]);
  const style=baseStyle?themedMapStyle(baseStyle,c.background!=='#FFFFFF'):null,key=JSON.stringify([signature,style]);
  const [snapshot,setSnapshot]=useState({key:'',uri:''});
  useEffect(()=>{if(!active||!drawing||!style||synthetic)return;let live=true;void homeThumbnail(stable,style).then(uri=>{if(live)setSnapshot({key,uri});},()=>{});return()=>{live=false;};},[active,drawing,style,synthetic,stable,key]);
  const uri=snapshot.key===key?snapshot.uri:null;
  return <View accessible accessibilityLabel={label} pointerEvents="none" style={{aspectRatio:1,width:'100%',backgroundColor:c.navigation,borderRadius:14,overflow:'hidden',justifyContent:'center'}}>
    {uri||drawing?<Image testID="home-preview-image" source={{uri:uri||drawing!}} contentFit={uri?'cover':'contain'} onError={()=>{if(uri)setSnapshot({key,uri:''});}} cachePolicy="memory-disk" style={StyleSheet.absoluteFill}/>:<AppText variant="caption" style={{color:c.muted,padding:8,textAlign:'center'}}>{unavailable?'경로를 읽지 못했어요':'경로 기록이 없어요'}</AppText>}
  </View>;
});
