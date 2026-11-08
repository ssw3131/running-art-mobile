import { View,useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui';
import { durationLabel,paceLabel,type Run } from '@/modules/running/model';
import { useThemeColors } from '@/theme/ThemeProvider';
export function resultTime(ms:number){const text=durationLabel(ms);return ms<3600000?text.slice(3):text;}
export function RunMetrics({run,compact=false,showCalories=false}:{run:Run;compact?:boolean;showCalories?:boolean}){
 const c=useThemeColors(),{fontScale}=useWindowDimensions();
 const stats=[
 {label:'총 거리',value:(run.distanceM/1000).toFixed(1),unit:'km',icon:require('../../../assets/achievements/distance.svg'),width:20,height:20},
 {label:'완주 시간',value:resultTime(run.activeMs),unit:'',icon:require('../../../assets/achievements/timer.svg'),width:20,height:20},
 {label:'평균 페이스',value:paceLabel(run.activeMs,run.distanceM).replace(' /km',''),unit:'/ km',icon:require('../../../assets/achievements/pace.svg'),width:20,height:20},
 {label:'칼로리 소모',value:'—',unit:'kcal',icon:require('../../../assets/achievements/figma-20261108/calories.svg'),width:20,height:21},
 ];
 return <View testID="run-result-metrics" style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
  {stats.filter(stat=>showCalories||stat.label!=='칼로리 소모').map(stat=><View key={stat.label} accessibilityLabel={stat.label==='칼로리 소모'?'칼로리 소모, 측정 정보 없음':undefined} style={{width:fontScale>1.4?'100%':'48%',flexGrow:1,padding:compact?12:16,gap:6,borderRadius:16,backgroundColor:c.background==='#FFFFFF'?'#F8F9FA':c.navigation}}>
   <View style={{flexDirection:'row',gap:6,alignItems:'center'}}><Image source={stat.icon} style={{width:stat.width,height:stat.height}} accessible={false}/><AppText weight="bold" style={{fontSize:14,lineHeight:22,color:c.muted}}>{stat.label}</AppText></View>
   <AppText family="roboto" weight="black" numberOfLines={1} adjustsFontSizeToFit style={{fontSize:32,lineHeight:40,textAlign:'center'}}>{stat.value}<AppText weight="semibold" style={{fontSize:12,lineHeight:18,color:c.muted}}>{stat.unit?' '+stat.unit:''}</AppText></AppText>
  </View>)}
 </View>;
}
