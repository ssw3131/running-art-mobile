import { Pressable,View,useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui';
import { durationLabel,paceLabel,type Run } from '@/modules/running/model';
import { estimatedRunningKcal } from '@/modules/running/calories';
import { isSimulationRun } from '@/modules/running/simulation-record';
import { useThemeColors } from '@/theme/ThemeProvider';
export function resultTime(ms:number){const text=durationLabel(ms);return ms<3600000?text.slice(3):text;}
export function RunMetrics({run,compact=false,showCalories=false,weightKg,onSetWeight}:{run:Run;compact?:boolean;showCalories?:boolean;weightKg?:number;onSetWeight?():void}){
 const c=useThemeColors(),{fontScale}=useWindowDimensions();
 const calories=estimatedRunningKcal(run.distanceM,weightKg);
 const stats=[
 {label:'총 거리',value:(run.distanceM/1000).toFixed(1),unit:'km',icon:require('../../../assets/achievements/distance.svg'),width:20,height:20},
 {label:run.courseOutcome==='finished'?'완주 시간':'러닝 시간',value:resultTime(run.activeMs),unit:'',icon:require('../../../assets/achievements/timer.svg'),width:20,height:20},
 {label:'평균 페이스',value:paceLabel(run.activeMs,run.distanceM).replace(' /km',''),unit:'/ km',icon:require('../../../assets/achievements/pace.svg'),width:20,height:20},
 {label:'칼로리 소모',value:calories===null?'—':String(calories),unit:'kcal',icon:require('../../../assets/achievements/figma-20261108/calories.svg'),width:20,height:21},
 ];
 return <View style={{gap:10}}><View testID="run-result-metrics" style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
  {stats.filter(stat=>showCalories||stat.label!=='칼로리 소모').map(stat=><View key={stat.label} accessibilityLabel={stat.label==='칼로리 소모'?calories===null?'칼로리 소모, 체중 설정 필요':`칼로리 소모 추정 ${calories} kcal`:undefined} style={{width:fontScale>1.4?'100%':'48%',flexGrow:1,padding:compact?12:16,gap:6,borderRadius:16,backgroundColor:c.background==='#FFFFFF'?'#F8F9FA':c.navigation}}>
   <View style={{flexDirection:'row',gap:6,alignItems:'center'}}><Image source={stat.icon} style={{width:stat.width,height:stat.height}} accessible={false}/><AppText weight="bold" style={{fontSize:14,lineHeight:22,color:c.muted}}>{stat.label}</AppText></View>
   <AppText family="roboto" weight="black" numberOfLines={1} adjustsFontSizeToFit style={{fontSize:32,lineHeight:40,textAlign:'center'}}>{stat.value}<AppText weight="semibold" style={{fontSize:12,lineHeight:18,color:c.muted}}>{stat.unit?' '+stat.unit:''}</AppText></AppText>
  </View>)}
 </View>
 {showCalories&&<View style={{gap:4}}><AppText testID="calorie-estimate-note" style={{fontSize:11,lineHeight:17,color:c.muted}}>{calories===null?'체중을 설정하면 예상 칼로리를 표시해요.':`${isSimulationRun(run)?'시뮬레이션상 예상치 · ':''}현재 설정 체중 ${weightKg}kg 기준 추정치예요. 경사·개인차는 반영하지 않으며, 과거 기록도 현재 체중으로 계산해요.`}</AppText>{onSetWeight&&<Pressable testID="result-set-weight" accessibilityRole="button" onPress={onSetWeight} style={{minHeight:40,justifyContent:'center'}}><AppText weight="bold" style={{fontSize:12,color:c.selected}}>마이페이지에서 체중 {weightKg===undefined?'설정':'변경'}하기</AppText></Pressable>}</View>}
 </View>;
}
