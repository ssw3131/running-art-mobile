import { useState } from 'react';
import { Image } from 'expo-image';
import { router,useLocalSearchParams } from 'expo-router';
import { ActivityIndicator,Pressable,View,useWindowDimensions } from 'react-native';
import { AppText,Button } from '@/components/ui';
import { useThemeColors } from '@/theme/ThemeProvider';
import { AchievementPage } from './AchievementPage';
import { BadgeImage } from './BadgeImage';
import { BadgeTabs } from './BadgeVisuals';
import { useBadgeGallery } from './use-badge-gallery';
import { challengeGroups } from '@/modules/achievements/challenges';
import { ChallengeCard } from './ChallengeGroups';

export default function BadgeGalleryScreen(){
 const params=useLocalSearchParams<{view?:string}>(),[challenge,setChallenge]=useState(params.view==='challenges'),gallery=useBadgeGallery(),c=useThemeColors();
 const badges=gallery.data?.badges??[],groups=[...new Set(badges.map(b=>b.definition.group))],earned=badges.filter(b=>b.earned);
 const {width}=useWindowDimensions(),gridGap=Math.max(8,(Math.min(width,680)-64-40-240)/2);
 const challenges = challengeGroups(badges);
 const activeCount = challenges.filter(group => group.active).length;
 return <AchievementPage title="뱃지 보관함" gutter={32}>
  <BadgeTabs challenge={challenge} onChange={setChallenge}/>
  {!gallery.data&&!gallery.error&&<ActivityIndicator accessibilityLabel="뱃지 불러오는 중"/>}
  {!!gallery.error&&<><AppText accessibilityRole="alert">{gallery.error}</AppText><Button label="다시 확인" onPress={gallery.retry}/></>}
  {!!gallery.data&&<>
   <View style={{backgroundColor:'#FEF2EC',borderRadius:20,minHeight:102,padding:20,overflow:'hidden'}}>
    <Image source={require('../../../assets/achievements/figma-20261108/badge-banner.png')} style={{position:'absolute',right:0,bottom:0,width:152,height:82}} contentFit="contain" accessible={false}/>
    <AppText weight="bold" style={{fontSize:challenge?18:16,lineHeight:24,color:'#111'}}>{challenge?'다음 성취를 향해 달리세요':'발로 차곡 차곡 모은 나의 뱃지'}</AppText>
    <AppText weight="bold" style={{fontSize:36,lineHeight:44,color:c.selected}}>{challenge&&<AppText weight="bold" style={{fontSize:14,color:'#111'}}>현재 도전 </AppText>}{challenge?activeCount:earned.length}<AppText weight="bold" style={{fontSize:14,color:'#111'}}>{challenge?' 개 진행 중':' 개 획득'}</AppText></AppText>
   </View>
   {!challenge?<View testID="badge-gallery" style={{padding:20,borderRadius:20,backgroundColor:c.surface,boxShadow:'0px 0px 5px rgba(0,0,0,.15)',gap:35}}>
    {groups.map(group=><View key={group} style={{gap:15}}><AppText weight="bold" style={{fontSize:16,lineHeight:22}}>{group}</AppText>
     <View style={{flexDirection:'row',flexWrap:'wrap',columnGap:gridGap,rowGap:16}}>
      {badges.filter(b=>b.definition.group===group).map(b=><Pressable key={b.definition.id} testID={`gallery-badge-${b.definition.id}`} accessibilityRole="button" accessibilityState={{disabled:!b.earned}} accessibilityLabel={`${b.definition.title} ${b.definition.accent}, ${b.earned?'획득':'미달성'}`} disabled={!b.earned} onPress={()=>router.push({pathname:'/badge-detail',params:{id:b.definition.id}})} style={{width:80,alignItems:'center',gap:4}}>
       <BadgeImage id={b.definition.id} earned={b.earned}/><AppText weight="bold" style={{fontSize:12,lineHeight:16,textAlign:'center',color:b.earned?c.text:c.subtle}}>{b.definition.title}{'\n'}{b.definition.accent}</AppText>
      </Pressable>)}
     </View>
    </View>)}
   </View>:<View testID="badge-challenges" style={{gap:20}}>
    {challenges.map(group => <ChallengeCard key={group.id} group={group}/>)}
   </View>}
   {!challenge&&<Button label="도전중인 뱃지 보러가기" onPress={()=>setChallenge(true)}/>}
  </>}
 </AchievementPage>;
}
