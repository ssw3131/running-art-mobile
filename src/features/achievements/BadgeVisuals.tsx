import { Image } from 'expo-image';
import { Pressable,View } from 'react-native';
import { AppText } from '@/components/ui';
import { useThemeColors } from '@/theme/ThemeProvider';
import { BadgeImage } from './BadgeImage';
import type { BadgeProgress } from '@/modules/achievements/catalog';
export function BadgeHero({badge,celebrate=true,challenge=false,onReady}:{badge:BadgeProgress;celebrate?:boolean;challenge?:boolean;onReady?():void}){
 const c=useThemeColors(),d=badge.definition;
 return <View style={{alignItems:'center',gap:20}}>
  <AppText weight="black" style={{fontSize:32,lineHeight:46,textAlign:'center',alignSelf:'stretch',flexShrink:1}}>{d.kind==='shape'||d.kind==='collection'?d.title+'\n':''}<AppText weight="black" style={{fontSize:32,lineHeight:46,color:c.selected}}>{d.kind==='shape'||d.kind==='collection'?d.accent:d.title}</AppText>{!['shape','collection'].includes(d.kind)&&!(challenge&&['distance','time'].includes(d.kind))?<>{'\n'}<AppText weight="black" style={{fontSize:32,lineHeight:46,color:challenge||d.kind==='category'?c.text:c.selected}}>{d.accent}</AppText></>:null}{' '+d.subtitle}</AppText>
  <View style={{width:'100%',height:206,alignItems:'center',justifyContent:'center'}}>
   {celebrate&&<Image source={require('../../../assets/achievements/confetti.png')} style={{position:'absolute',left:-24,right:-24,height:206}} contentFit="cover" accessible={false}/>}
   <BadgeImage id={d.id} size={170} onLoad={onReady}/>
  </View>
 </View>;
}
export function BadgeCondition({text}:{text:string}){
 const c=useThemeColors();
 return <View style={{borderRadius:20,backgroundColor:c.background==='#FFFFFF'?'#F4F4F4':c.surface,padding:20,flexDirection:'row',gap:16,alignItems:'center'}}>
  <Image testID="badge-condition-icon" source={require('../../../assets/achievements/condition-check.svg')} style={{width:24,height:24,flexShrink:0}} contentFit="contain" accessible={false}/>
  <View style={{flex:1,gap:4}}><AppText weight="bold" style={{fontSize:16,lineHeight:22}}>뱃지 획득 조건</AppText><AppText weight="medium" style={{fontSize:14,lineHeight:22,color:c.subtle}}>{text}</AppText></View>
 </View>;
}
export function BadgeScale({kind,progress}:{kind:'distance'|'time';progress:number}){
 const c=useThemeColors(),unit=kind==='distance'?'km':'시간',value=progress/(kind==='distance'?1000:3600000),ticks=kind==='distance'?[0,10,50,100,300]:[0,5,50,100,500];
 let percent=100;
 for(let i=1;i<ticks.length;i++)if(value<=ticks[i]){percent=((i-1)+(value-ticks[i-1])/(ticks[i]-ticks[i-1]))/(ticks.length-1)*100;break;}
 return <View testID="badge-scale" style={{padding:16,gap:10}}>
  <AppText weight="black" family="roboto" style={{fontSize:36,lineHeight:44,textAlign:'center'}}>{Number(value.toFixed(1))}<AppText weight="bold" style={{fontSize:20}}> {unit}</AppText></AppText>
  <View accessible accessibilityRole="progressbar" accessibilityValue={{min:0,max:ticks.at(-1),now:Math.min(value,ticks.at(-1)!)} } style={{height:10,borderRadius:5,backgroundColor:c.outline,overflow:'hidden'}}><View style={{height:10,width:`${Math.max(0,Math.min(100,percent))}%`,backgroundColor:c.selected,borderRadius:5}}/></View>
  <View style={{flexDirection:'row',justifyContent:'space-between'}}>{ticks.map(n=><AppText key={n} style={{fontSize:10,lineHeight:16,color:c.subtle}}>{n}{unit}</AppText>)}</View>
 </View>;
}
export function BadgeTabs({challenge,onChange}:{challenge:boolean;onChange(value:boolean):void}){
 const c=useThemeColors();
 return <View style={{flexDirection:'row',borderBottomWidth:1,borderColor:c.divider,minHeight:43}}>{[false,true].map(value=><Pressable key={String(value)} testID={value?'badge-tab-challenges':'badge-tab-gallery'} accessibilityRole="tab" accessibilityState={{selected:value===challenge}} onPress={()=>onChange(value)} style={{flex:1,alignItems:'center',justifyContent:'center',minHeight:48,gap:8}}>
  <AppText weight={value===challenge?'bold':'medium'} style={{fontSize:value===challenge?18:17,lineHeight:24,color:value===challenge?c.selected:c.subtle}}>{value?'도전 중':'보관함'}</AppText>
  <View style={{width:80,height:3.5,borderRadius:2,backgroundColor:value===challenge?c.selected:'transparent'}}/>
 </Pressable>)}</View>;
}
