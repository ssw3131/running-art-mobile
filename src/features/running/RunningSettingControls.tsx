import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image, type ImageProps } from 'expo-image';
import { AppText } from '@/components/ui';
import { useThemeColors } from '@/theme/ThemeProvider';

export const settingCard = {padding:16,borderRadius:20,gap:12,boxShadow:'0px 0px 10px rgba(0,0,0,0.12)'} as const;

/** Decorative images may be unavailable in a disconnected development client. */
export function SettingIcon({source}:{source:ImageProps['source']}) {
  const [failed,setFailed]=useState(false),c=useThemeColors();
  return failed?null:<Image source={source} tintColor={c.text} onError={()=>setFailed(true)} accessible={false} style={{width:24,height:24,flexShrink:0}}/>;
}

export function SettingToggle({label,description,checked,disabled,onChange,testID,icon}:{
  label:string;description:string;checked:boolean;disabled:boolean;onChange(value:boolean):void;testID:string;icon?:ImageProps['source'];
}) {
  const c=useThemeColors();
  return <Pressable testID={testID} accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={description}
    accessibilityState={{checked,disabled}} disabled={disabled} onPress={()=>onChange(!checked)}
    style={({pressed})=>({...settingCard,backgroundColor:c.surface,opacity:pressed?0.7:disabled?0.55:1})}>
    <View style={{flexDirection:'row',gap:12,alignItems:'center'}}>
      {!!icon&&<SettingIcon source={icon}/>}
      <AppText weight="bold" style={{fontSize:18,lineHeight:26,flex:1}}>{label}</AppText>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{gap:3,alignItems:'center',flexShrink:0}}>
        <View style={{width:50,height:28,borderRadius:14,padding:3,justifyContent:'center',alignItems:checked?'flex-end':'flex-start',backgroundColor:checked?c.selected:c.outline}}>
          <View style={{width:22,height:22,borderRadius:11,backgroundColor:'#FFFFFF'}}/>
        </View>
        <AppText variant="caption" style={{color:c.muted}}>{checked?'켜짐':'꺼짐'}</AppText>
      </View>
    </View>
    <AppText variant="caption" style={{color:c.muted}}>{description}</AppText>
  </Pressable>;
}
