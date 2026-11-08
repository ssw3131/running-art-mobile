import { ActivityIndicator,ScrollView,View } from 'react-native';
import { Image } from 'expo-image';
import { Stack,router,useLocalSearchParams } from 'expo-router';
import { AppText,Button,Icon } from '@/components/ui';
import { useRunResult } from '@/features/achievements/use-run-result';
import { RunMetrics } from '@/features/achievements/RunMetrics';
import { badgeImages } from '@/features/achievements/badge-images';
import { BadgeImage } from '@/features/achievements/BadgeImage';
import { homePathSvg } from '@/modules/home/model';
import { useThemeColors } from '@/theme/ThemeProvider';
import { openServiceTab } from '@/features/service/open-service-tab';
import { isSimulationRun } from '@/modules/running/simulation-record';
export default function RunResultScreen(){
 const params=useLocalSearchParams<{id:string}>(),id=typeof params.id==='string'?params.id:'',{data,error,retry}=useRunResult(id),c=useThemeColors();
 const finished=data?.run.courseOutcome==='finished'&&!!data.course,shape=data?.course?.snapshot.shape;
 const badge=data?.achievements.badges.find(item=>item.shape===shape),first=badge?.firstRunId===id;
 const uri=data?.course?homePathSvg([data.course.snapshot.target],c.selected):null;
 return <ScrollView style={{backgroundColor:c.background}} contentContainerStyle={{paddingTop:32,paddingBottom:44,gap:8,maxWidth:680,width:'100%',alignSelf:'center'}}>
  <Stack.Screen options={{title:finished?'완주 결과':'러닝 결과',headerShown:!finished}}/>
  {!data&&!error&&<ActivityIndicator accessibilityLabel="러닝 결과 확인 중"/>}
  {!!error&&<View style={{padding:24,gap:16}}><AppText accessibilityRole="alert">{error}</AppText><Button label="다시 불러오기" onPress={retry}/></View>}
  {data&&<>
   <View style={{height:160,alignItems:'center',justifyContent:'center',gap:12,marginHorizontal:5}}>
    {finished&&<><Image source={require('../../assets/achievements/figma-20261108/dot-a.svg')} style={{position:'absolute',left:45,top:30,width:12,height:12}}/>
    <Image source={require('../../assets/achievements/figma-20261108/dot-b.svg')} style={{position:'absolute',right:45,top:45,width:8,height:8}}/>
    <Image source={require('../../assets/achievements/sparkles.svg')} style={{position:'absolute',left:95,top:20,width:24,height:24}}/>
    <Image source={require('../../assets/achievements/sparkle.svg')} style={{position:'absolute',right:95,top:15,width:20,height:20}}/>
    <View style={{position:'absolute',left:55,top:110,width:6,height:12,borderRadius:3,backgroundColor:c.selected,transform:[{rotate:'15deg'}]}}/>
    <View style={{position:'absolute',right:55,top:110,width:12,height:6,borderRadius:3,backgroundColor:c.selected,transform:[{rotate:'-25deg'}]}}/>
    <View style={{width:56,height:56,alignItems:'center',justifyContent:'center',backgroundColor:'#FFF3EC',borderRadius:28,borderWidth:1.5,borderColor:'#FFD1BA'}}><Image source={require('../../assets/achievements/trophy.svg')} style={{width:26,height:26}} testID="completion-trophy"/></View></>}
    <AppText testID="run-result-title" weight="black" style={{fontSize:30,lineHeight:40,textAlign:'center'}}>{finished?'완주를 축하합니다!':'오늘의 러닝을 기록했어요'}</AppText>
   </View>
   {finished&&<View style={{height:235,alignItems:'center',justifyContent:'center',gap:14}}>
    <Image source={require('../../assets/achievements/confetti.png')} style={{position:'absolute',width:'100%',height:235}} contentFit="cover"/>
    {shape&&badgeImages[shape]?<View testID={first?'completion-first-badge':undefined}><BadgeImage id={shape} size={170}/></View>:uri?<View style={{width:160,height:160,backgroundColor:'#F8F9FA',borderWidth:2,borderColor:'#FC560226',borderRadius:80,padding:16,boxShadow:'0px 12px 32px rgba(252,86,2,.1)'}}><Image source={{uri}} style={{flex:1}} contentFit="contain"/></View>:null}
    <View style={{flexDirection:'row',alignItems:'center',gap:6}}><Image source={require('../../assets/achievements/figma-20261108/pin.svg')} style={{width:16,height:16}}/><AppText testID="run-result-badge" weight="bold" style={{fontSize:16,lineHeight:22}}>{data.course?.name}</AppText></View>
   </View>}
   {isSimulationRun(data.run)&&<AppText variant="caption" style={{textAlign:'center',color:c.selected}}>시뮬레이션 완주 기록</AppText>}
   <View style={{paddingHorizontal:29,paddingTop:12,paddingBottom:12}}><RunMetrics run={data.run} showCalories={finished}/></View>
   <View style={{paddingHorizontal:26,paddingTop:24,gap:20}}>
    <Button label="공유 하기" testID="run-result-share" leading={<Icon name="share"/>} onPress={()=>router.push({pathname:'/run-card',params:{id}})}/>
    <Button label="완주 기록 보관함으로 이동" testID="result-detail" variant="outline" contentStyle={{minHeight:50}} labelStyle={{fontSize:16,color:c.subtle}} onPress={()=>openServiceTab({pathname:'/courses',params:{view:'runs'}})}/>
    <Button label="홈으로 이동" variant="secondary" contentStyle={{minHeight:50}} labelStyle={{fontSize:16}} onPress={()=>openServiceTab('/')}/>
   </View>
  </>}
 </ScrollView>;
}
