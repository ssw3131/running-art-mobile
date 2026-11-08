import { useRef,useState } from 'react';
import { ActivityIndicator,Alert,Pressable,ScrollView,TextInput,View } from 'react-native';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { serviceTabs } from '@/features/service/navigation';
import { ServiceHeader } from '@/features/service/ServiceHeader';
import { AppModal,AppText,Button } from '@/components/ui';
import { useRunResult } from '@/features/achievements/use-run-result';
import { badgeImages } from '@/features/achievements/badge-images';
import { homePathSvg } from '@/modules/home/model';
import { BadgeImage } from '@/features/achievements/BadgeImage';
import { RegionText } from '@/features/achievements/RegionText';
import { recordDate } from '@/features/achievements/BadgeRunCard';
import { useThemeColors } from '@/theme/ThemeProvider';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { getStorage } from '@/modules/storage/database';
import { COURSE_NAME_MAX } from '@/modules/courses/model';
import { durationLabel } from '@/modules/running/model';
import { prepareRunRetry } from '@/modules/running/retry';
import { isSimulationRun } from '@/modules/running/simulation-record';
import { useTerrain } from '@/features/terrain/use-terrain';
import { usePointAddress } from '@/features/course-generation/use-point-address';
import { DifficultyTag } from '@/features/course-generation/DifficultyTag';
import { GenerationIcon } from '@/features/course-generation/GenerationIcon';
import { DetailIcon,InformationRow } from '@/features/courses/CourseInformation';
import { openServiceTab } from '@/features/service/open-service-tab';
import { shareRunCourseGpx } from '@/modules/courses/share-gpx';
import RunPath from './RunPath';

export default function CompletedDetail({id}:{id:string}){
 const {data,error,retry}=useRunResult(id),c=useThemeColors(),auth=useAuth(),insets=useSafeAreaInsets();
 const [busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[editing,setEditing]=useState(false),[name,setName]=useState('');
 const working=useRef(false),terrain=useTerrain(data?.course?.snapshot.route,true),address=usePointAddress(data?.course?.snapshot.origin);
 const first=data?.achievements.badges.some(b=>b.shape===data.course?.snapshot.shape&&b.firstRunId===id),owner=auth.account?.id??'';
 const check=()=>{if((authentication.getSnapshot().account?.id??'')!==owner)throw new Error('계정이 바뀌었어요.');};
 async function act(task:()=>Promise<unknown>){
  if(working.current)return;working.current=true;setBusy(true);setFailure('');
  try{check();await task();check();}catch(e){setFailure(e instanceof Error?e.message:'다시 시도해 주세요.');}finally{working.current=false;setBusy(false);}
 }
 const rechallenge=()=>void act(async()=>{const db=await getStorage();check();const saved=await prepareRunRetry(db,id,check);check();openServiceTab({pathname:'/run',params:{courseId:saved.id}});});
 const rename=()=>void act(async()=>{const db=await getStorage();check();await db.runs.renameCourseRecord(id,name);check();setEditing(false);retry();});
 const remove=()=>Alert.alert('완주 기록을 삭제할까요?','이 기록의 GPS와 요약을 삭제하고 뱃지·통계를 다시 계산합니다. 저장한 코스는 유지됩니다.',[{text:'취소',style:'cancel'},{text:'삭제',style:'destructive',onPress:()=>void act(async()=>{await(await getStorage()).runs.remove(id);check();openServiceTab({pathname:'/courses',params:{view:'runs'}});})}]);
 const count=data?.shapeCompletion??data?.achievements.badges.find(b=>b.shape===data.course?.snapshot.shape)?.count??1;
 return <View style={{flex:1,backgroundColor:c.background}}>
  <Stack.Screen options={{title:'완주 기록 상세',header:()=> <ServiceHeader title="완주 기록 상세" back menu={false}/>}}/>
  <ScrollView testID="completed-run-detail" contentContainerStyle={{paddingBottom:29}}>
   {!data&&!error&&<ActivityIndicator accessibilityLabel="완주 기록 불러오는 중"/>}
   {!!(error||failure)&&<View style={{padding:24,gap:12}}><AppText accessibilityRole="alert">{error||failure}</AppText>{!!error&&<Button label="다시 불러오기" onPress={retry}/>}</View>}
   {data?.course&&data.run.courseOutcome==='finished'&&<>
    <View style={{height:208,alignItems:'center'}}>
     <Image source={require('../../../assets/achievements/confetti.png')} style={{position:'absolute',top:2,width:'100%',height:206}} contentFit="cover" accessible={false}/>
     <View style={{position:'absolute',top:38,width:170,height:170}}>
      {first?<View testID="completion-first-badge">{badgeImages[data.course.snapshot.shape]?<BadgeImage id={data.course.snapshot.shape} size={170}/>:<Image source={{uri:homePathSvg([data.course.snapshot.target],c.selected)!}} style={{width:170,height:170}}/>}</View>:<View testID="completion-trophy" style={{width:170,height:170,overflow:'hidden'}}><Image source={require('../../../assets/archive/trophy.png')} style={{position:'absolute',left:-9.42,top:-9.23,width:189.06,height:189.06}} contentFit="contain"/></View>}
     </View>
    </View>
    <View style={{marginTop:24,paddingHorizontal:24,alignItems:'center',gap:6}}>
     <AppText weight="black" style={{fontSize:26,lineHeight:30,textAlign:'center'}}><AppText weight="black" style={{color:c.selected}}>{auth.account?.name||'러너'}</AppText>님{'\n'}완주를 축하합니다.</AppText>
     <AppText weight="bold" style={{fontSize:16,lineHeight:24,textAlign:'center',color:c.subtle}}>{data.course.name} <AppText weight="bold" style={{color:c.selected}}>{count}회</AppText> 완주했어요.</AppText>
     {isSimulationRun(data.run)&&<AppText variant="caption" style={{color:c.selected}}>시뮬레이션 완주 기록</AppText>}
    </View>
    <View style={{marginTop:19,marginHorizontal:32,minHeight:161,borderRadius:20,borderWidth:2,borderColor:c.selected,backgroundColor:c.surface,padding:10,gap:9,justifyContent:'center',boxShadow:'0px 0px 5px rgba(0,0,0,.2)'}}>
     <AppText weight="black" style={{fontSize:24,lineHeight:32,textAlign:'center'}}>{data.course.name}</AppText>
     <View style={{height:1,backgroundColor:c.divider,marginHorizontal:8}}/>
     <View style={{flexDirection:'row',gap:24,paddingHorizontal:10}}>
      <View style={{flex:1}}><AppText weight="bold" style={{fontSize:16,lineHeight:23,color:c.subtle}}>전체 거리</AppText><AppText family="roboto" weight="black" style={{fontSize:28,lineHeight:34,color:c.selected}}>{(data.run.distanceM/1000).toFixed(1)}<AppText weight="bold" style={{fontSize:16,color:c.selected}}> km</AppText></AppText></View>
      <View style={{flex:1.3}}><AppText weight="bold" style={{fontSize:16,lineHeight:23,color:c.subtle}}>{isSimulationRun(data.run)?'모의 러닝 시간':'실제 러닝 시간'}</AppText><AppText family="roboto" weight="black" numberOfLines={1} adjustsFontSizeToFit style={{fontSize:28,lineHeight:34,color:c.selected}}>{durationLabel(data.run.activeMs)}</AppText></View>
     </View>
     <View style={{flexDirection:'row',gap:10,paddingHorizontal:10,alignItems:'center'}}><View style={{flex:1}}><RegionText lat={data.course.snapshot.origin.lat} lng={data.course.snapshot.origin.lng} style={{fontSize:16,lineHeight:22}}/></View><AppText family="roboto" weight="medium" style={{fontSize:16,lineHeight:22}}>{recordDate(data.run.startedAt)}</AppText></View>
    </View>
    <View style={{marginTop:41}}><RunPath points={data.points} course={data.course.snapshot} background/></View>
    <View style={{paddingHorizontal:32,paddingTop:34,gap:17}}>
     <InformationRow icon="flag" label="코스명"><View style={{flexDirection:'row',gap:16,alignItems:'center'}}><AppText weight="bold" style={{fontSize:18,flexShrink:1}}>{data.course.name}</AppText><Pressable testID="completed-edit-name" accessibilityRole="button" accessibilityLabel="기록의 코스 이름 수정" hitSlop={16} onPress={()=>{setName(data.course!.name);setEditing(true);}}><DetailIcon name="edit"/></Pressable></View></InformationRow>
     <InformationRow icon="pin" label="출발지"><AppText weight="bold" style={{fontSize:16}}>{address.label}</AppText></InformationRow>
     <InformationRow icon="map" label="전체 거리"><AppText weight="bold" style={{fontSize:18}}>{(data.run.distanceM/1000).toFixed(2)} km</AppText></InformationRow>
     <InformationRow icon="watch" label="실제 러닝 시간"><AppText weight="bold" style={{fontSize:18}}>{durationLabel(data.run.activeMs).replaceAll(':',' : ')}</AppText></InformationRow>
     <InformationRow icon="difficulty" label="난이도"><DifficultyTag state={{kind:terrain.state.profile?'ready':terrain.state.status==='loading'?'loading':'error',profile:terrain.state.profile??undefined}}/></InformationRow>
    </View>
    <View style={{paddingHorizontal:26,marginTop:55,gap:20}}>
     <Button testID="run-rechallenge" label="러닝 재도전하기" leading={<GenerationIcon name="run"/>} disabled={busy} onPress={rechallenge}/>
     <Button testID="completed-export-gpx" label="GPX파일 다운로드" variant="secondary" contentStyle={{minHeight:50}} labelStyle={{fontSize:16}} disabled={busy} onPress={()=>void act(()=>shareRunCourseGpx(id))}/>
     <Button testID="completed-delete" label="기록 삭제하기" variant="secondary" contentStyle={{minHeight:50,backgroundColor:'transparent'}} labelStyle={{fontSize:16}} disabled={busy} onPress={remove}/>
    </View>
   </>}
  </ScrollView>
  <BottomTabBar value="archive" bottomInset={insets.bottom} onChange={value=>{const tab=serviceTabs.find(t=>t.value===value);if(tab)openServiceTab(tab.href);}}/>
  <AppModal visible={editing} title="기록의 코스 이름 수정" onClose={()=>{if(!busy)setEditing(false);}} footer={<View style={{gap:8}}><Button label="이름 적용" disabled={busy||!name.trim()} onPress={rename}/><Button variant="secondary" label="취소" disabled={busy} onPress={()=>setEditing(false)}/></View>}>
   <TextInput accessibilityLabel="기록의 코스 이름" value={name} onChangeText={setName} maxLength={COURSE_NAME_MAX} style={{minHeight:48,padding:12,borderWidth:1,borderColor:c.outline,borderRadius:8,color:c.text}}/>
  </AppModal>
 </View>;
}
