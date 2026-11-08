import { router } from 'expo-router';
import { Pressable,View } from 'react-native';
import { AppText,Icon } from '@/components/ui';
import { GenerationIcon,LegacyShapeIcon } from '@/features/course-generation/GenerationIcon';
import { SERVICE_SHAPES } from '@/modules/route-engine/service-shapes';
import { durationLabel } from '@/modules/running/model';
import { isSimulationRun } from '@/modules/running/simulation-record';
import { useThemeColors } from '@/theme/ThemeProvider';
import type { BadgeRecord } from '@/modules/achievements/catalog';
import { RegionText } from './RegionText';
export const recordDate=(value:number)=>{const d=new Date(value);return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;};
export function BadgeRunCard({run}:{run:BadgeRecord}){
 const c=useThemeColors(),shape=SERVICE_SHAPES.find(s=>s.id===run.shape);
 return <Pressable testID={`badge-record-${run.id}`} accessibilityRole="button" onPress={()=>router.push({pathname:'/runs/[id]',params:{id:run.id}})} style={{minHeight:100,padding:12,borderRadius:20,backgroundColor:c.surface,boxShadow:'0px 0px 5px rgba(0,0,0,.15)',flexDirection:'row',gap:16,alignItems:'center'}}>
  <View style={{width:72,height:72,borderRadius:36,borderWidth:1,borderColor:c.outline,alignItems:'center',justifyContent:'center'}}>{shape?<GenerationIcon name={shape.id} color={c.selected}/>:run.shape?<LegacyShapeIcon shape={run.shape}/>:<Icon name="run"/>}</View>
  <View style={{flex:1,gap:3}}><AppText weight="bold" style={{fontSize:16,lineHeight:22}}>{recordDate(run.startedAt)}</AppText><AppText weight="bold" style={{fontSize:14,lineHeight:20}}>{(run.distanceM/1000).toFixed(2)} km / {durationLabel(run.activeMs)}</AppText><RegionText lat={run.originLat} lng={run.originLng}/>{isSimulationRun(run)&&<AppText variant="caption" style={{color:c.selected}}>시뮬레이션</AppText>}</View><Icon name="chevronRight" color={c.outline}/>
 </Pressable>;
}
