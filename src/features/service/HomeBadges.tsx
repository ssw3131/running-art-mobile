import { useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { AppText, Button } from '@/components/ui';
import { BadgeImage } from '@/features/achievements/BadgeImage';
import type { BadgeProgress } from '@/modules/achievements/catalog';
import type { HomeChallenge } from '@/modules/home/recommendation';
import { getStorage } from '@/modules/storage/database';
import { authentication } from '@/modules/auth/runtime';
import { useThemeColors } from '@/theme/ThemeProvider';

function RewardStage({id}:{id:string}) {
 return <View style={{width:106,height:98}}>
  <Image source={require('../../../assets/home/challenge-20261111/orbit.png')} style={{position:'absolute',left:3,top:0,width:100,height:100}}/>
  <Image source={require('../../../assets/home/challenge-20261111/spotlight.svg')} style={{position:'absolute',left:8,top:5,width:90,height:90}}/>
  <Image source={require('../../../assets/home/challenge-20261111/plinth.svg')} style={{position:'absolute',left:8,top:88,width:90,height:6}}/>
  <Image source={require('../../../assets/home/challenge-20261111/mount.svg')} style={{position:'absolute',left:-11,top:-5,width:128,height:128}}/>
  <View style={{position:'absolute',left:8,top:5,borderRadius:45,boxShadow:'2px 1px 1.4px rgba(31,54,36,.14)'}}><View style={{width:90,height:90,borderRadius:45,overflow:'hidden'}}><BadgeImage id={id} size={90}/></View></View>
  {[[0,13],[102,66]].map(([left,top],i)=><Image key={i} source={require('../../../assets/home/challenge-20261111/point3.svg')} style={{position:'absolute',left,top,width:3,height:3}}/>)}
  {[[4,96],[101,1]].map(([left,top],i)=><Image key={i} source={require('../../../assets/home/challenge-20261111/point2.svg')} style={{position:'absolute',left,top,width:2,height:2}}/>)}
 </View>;
}
export function HomeBadgeChallenge({challenge,owner}:{challenge:HomeChallenge;owner:string}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 const open=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  const current=()=>authentication.getSnapshot().account?.id===owner;
  try{
   const db=await getStorage();if(!current())return;
   for(let offset=0;;offset+=100){
    const rows=await db.courses.list(100,offset);if(!current())return;
    const course=rows.find(row=>row.shape===challenge.shape);
    if(course){router.push({pathname:'/courses/[id]',params:{id:course.id}});return;}
    if(rows.length<100)break;
   }
   router.navigate({pathname:'/route-lab',params:{homeSection:'conditions',homeShape:challenge.shape,homeRequest:String(Date.now())}});
  }catch{if(current())setError('저장 코스를 확인하지 못했어요. 다시 시도해 주세요.');}
  finally{lock.current=false;setBusy(false);}
 };
 const {badge,remaining,unit}=challenge,d=badge.definition;
 return <View testID="home-badge-challenge" style={{marginTop:25,marginBottom:20,paddingHorizontal:15,paddingTop:11,paddingBottom:12,borderRadius:22,borderWidth:1,borderColor:'#E6EBDD',backgroundColor:'#F5F7F1',gap:10}}>
  <View style={{flexDirection:'row',gap:8,minHeight:138}}>
   <View style={{flex:1,gap:7}}><AppText weight="bold" style={{fontSize:11,lineHeight:18,color:'#577052'}}>나를 위한 추천 뱃지</AppText><AppText weight="bold" style={{fontSize:16,lineHeight:21,color:'#263C2A'}}>다음엔 이 뱃지,{'\n'}내 컬렉션에 추가해요.</AppText><View style={{marginTop:16,gap:3}}><AppText testID="home-challenge-title" weight="bold" style={{fontSize:14,lineHeight:20,color:'#263C2A'}}>{d.title} {d.accent}</AppText><AppText style={{fontSize:11,lineHeight:15,color:'#5D6B59'}}>{d.kind==='shape'?'첫 완주만 하면 획득할 수 있어 추천해요.':'달성까지 가까운 뱃지에 도전해 보세요.'}</AppText></View></View>
   <View style={{width:106,gap:10}}><View style={{minHeight:22,borderRadius:11,borderWidth:1,borderColor:'#EED9AD',backgroundColor:'#FFF2D8',justifyContent:'center'}}><AppText weight="bold" style={{fontSize:11,lineHeight:18,textAlign:'center',color:'#70521C'}}>{remaining}{unit} 남음</AppText></View><RewardStage id={d.id}/></View>
  </View>
  <Button testID="home-challenge-start" label="이 뱃지 도전하러 가기" loading={busy} onPress={()=>void open()} contentStyle={{minHeight:54,backgroundColor:'#2C4B34',borderRadius:27,paddingHorizontal:12}} labelStyle={{fontSize:18,lineHeight:24,color:'#FFFFFF'}} trailing={<Image source={require('../../../assets/home/challenge-20261111/chevron.svg')} style={{width:28.8,height:25.2}}/>}/>
  {!!error&&<AppText accessibilityRole="alert" style={{fontSize:12,color:'#843C20'}}>{error}</AppText>}
 </View>;
}
export function HomeEarnedBadges({badges}:{badges:BadgeProgress[]}){
 const c=useThemeColors(),{width}=useWindowDimensions(),size=Math.min(100,(width-72)/3);
 const earned=badges.filter(b=>b.earned).sort((a,b)=>(b.earnedAt??0)-(a.earnedAt??0)||a.definition.id.localeCompare(b.definition.id)).slice(0,5);
 return <View testID="home-earned-badges" style={{marginBottom:20,gap:5}}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><AppText weight="bold" style={{fontSize:18}}>내 완주 뱃지</AppText><Pressable testID="home-badge-gallery" accessibilityRole="button" accessibilityLabel="뱃지 보관함" onPress={()=>router.push('/badges')} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:4}}><AppText style={{fontSize:16,color:c.subtle}}>뱃지 보관함</AppText><Image source={require('../../../assets/ui/chevron-right.svg')} style={{width:20,height:20}} tintColor={c.subtle}/></Pressable></View>
  {earned.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:20}}>{earned.map(b=><Pressable key={b.definition.id} testID={`home-earned-${b.definition.id}`} accessibilityRole="button" accessibilityLabel={`${b.definition.title} ${b.definition.accent} 뱃지 상세`} onPress={()=>router.push({pathname:'/badge-detail',params:{id:b.definition.id}})}><BadgeImage id={b.definition.id} size={size}/></Pressable>)}</ScrollView>:<AppText style={{fontSize:12,color:c.subtle}}>첫 완주 뱃지를 모아보세요.</AppText>}
 </View>;
}
