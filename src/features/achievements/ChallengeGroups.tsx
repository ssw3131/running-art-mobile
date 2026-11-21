import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { openServiceTab } from '@/features/service/open-service-tab';
import type { ChallengeGroup } from '@/modules/achievements/challenges';
import { useThemeColors } from '@/theme/ThemeProvider';
import { BadgeImage } from './BadgeImage';
import { BadgeCondition, BadgeHero, BadgeScale } from './BadgeVisuals';

export function ChallengeCard({ group }: { group: ChallengeGroup }) {
  const c = useThemeColors();
  const total = group.goals.length;
  function open() {
    const params = total === 1 ? { id:group.goals[0].definition.id, challenge:'1' } : { group:group.id };
    router.push({ pathname:'/badge-detail', params });
  }
  return <Pressable testID={`challenge-group-${group.id}`} accessibilityRole="button" onPress={open}
    accessibilityLabel={`${group.title}, ${total}종 중 ${group.earned}종 달성`}
    style={{minHeight:109, paddingLeft:20, paddingRight:10, paddingVertical:14, gap:6, alignItems:'center',
      flexDirection:'row', borderRadius:20, backgroundColor:c.surface, boxShadow:'0px 0px 5px rgba(0,0,0,.15)'}}>
    <BadgeImage id={group.image} size={80} earned={group.started}/>
    <View style={{flex:1,gap:1}}>
      <AppText weight="bold" style={{fontSize:16,lineHeight:20}}>{group.title}</AppText>
      <AppText style={{fontSize:11,lineHeight:20,color:c.subtle}}>{group.description}</AppText>
      <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
        <View style={{flex:1,height:10,borderRadius:5,backgroundColor:c.outline,overflow:'hidden'}}>
          <View style={{height:10,width:`${total ? group.earned / total * 100 : 0}%`,borderRadius:5,backgroundColor:c.selected}}/>
        </View>
        <AppText style={{fontSize:12,lineHeight:20,color:c.subtle}}>{group.earned}/{total} 종</AppText>
      </View>
    </View>
    <Image source={require('../../../assets/achievements/figma-20261108/badge-chevron.svg')} style={{width:30,height:30}} tintColor={c.outline}/>
  </Pressable>;
}

export function ChallengeGoals({ group }: { group: ChallengeGroup }) {
  const c = useThemeColors();
  const milestone = group.id === 'distance' || group.id === 'time' ? group.id : null;
  const current = group.goals.filter(goal => goal.earned).at(-1) ?? group.goals[0];
  return <>
    {milestone && current ? <>
      <BadgeHero badge={current} challenge groupGoal celebrate={false}/>
      <BadgeCondition text={milestone === 'distance' ? '러닝 누적 거리 해당 킬로수 달성' : '러닝 누적 시간 해당 시간 달성'}/>
      <BadgeScale kind={milestone} progress={current.progress}/>
    </> : <AppText weight="bold" style={{fontSize:24,lineHeight:34}}>{group.title}</AppText>}
    {group.goals.map(goal => {
      const d = goal.definition;
      const progress = Math.min(d.goal, goal.progress);
      const status = milestone ? (goal.earned ? '완료' : '미완료') :
        `${progress}/${d.goal}${d.kind === 'category' || d.kind === 'collection' ? '종' : '회'}`;
      return <Pressable key={d.id} testID={`challenge-goal-${d.id}`} accessibilityRole="button"
        onPress={() => router.push({pathname:'/badge-detail',params:milestone && goal.earned ? {id:d.id} : {id:d.id,challenge:'1'}})}
        style={{padding:14,minHeight:80,alignItems:'center',flexDirection:'row',gap:12,
          borderRadius:20,backgroundColor:c.surface,boxShadow:'0px 0px 5px rgba(0,0,0,.15)'}}>
        <BadgeImage id={d.id} size={60} earned={goal.earned}/>
        <AppText weight="bold" style={{flex:1,fontSize:16}}>{d.title} {d.accent}</AppText>
        <AppText weight="bold" style={{fontSize:12,color:goal.earned ? c.selected : c.subtle}}>{status}</AppText>
      </Pressable>;
    })}
    <Button variant="outline" label="홈으로" onPress={() => openServiceTab('/')}/>
  </>;
}
