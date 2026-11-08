import { useCallback,useRef,useState } from 'react';
import { ActivityIndicator,Alert,Pressable,View,useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router,useFocusEffect,useLocalSearchParams } from 'expo-router';
import { captureRef,releaseCapture } from 'react-native-view-shot';
import { AppModal,AppText,Button,Icon } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { getStorage } from '@/modules/storage/database';
import { retainCard,shareCardFile } from '@/modules/achievements/image-file';
import { courseShapes } from '@/modules/courses/model';
import { GenerationIcon } from '@/features/course-generation/GenerationIcon';
import { SERVICE_SHAPES } from '@/modules/route-engine/service-shapes';
import { useThemeColors } from '@/theme/ThemeProvider';
import { openServiceTab } from '@/features/service/open-service-tab';
import { AchievementPage } from './AchievementPage';
import { BadgeCondition,BadgeHero,BadgeScale } from './BadgeVisuals';
import { BadgeImage } from './BadgeImage';
import { BadgeRunCard,recordDate } from './BadgeRunCard';
import { useBadgeGallery } from './use-badge-gallery';

export default function BadgeDetailScreen(){
 const params=useLocalSearchParams<{id?:string;challenge?:string}>(),id=typeof params.id==='string'?params.id:'',auth=useAuth(),owner=auth.account?.id??'',gallery=useBadgeGallery(),c=useThemeColors();
 const badge=gallery.data?.badges.find(b=>b.definition.id===id),challenge=params.challenge==='1'||badge?.earned===false;
 const [shareOpen,setShareOpen]=useState(false),[deleteOpen,setDeleteOpen]=useState(false),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[shareReady,setShareReady]=useState(false),[deleteLimit,setDeleteLimit]=useState(30);
 const working=useRef(false),revision=useRef(0),canvas=useRef<View>(null);
 const {width}=useWindowDimensions(),shareWidth=Math.min(288,width-96),shareScale=shareWidth/288;
 const [decorationReady,setDecorationReady]=useState(false);
 // Reset pending previews when either the signed-in account or the selected badge changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useFocusEffect(useCallback(()=>()=>{revision.current++;setShareOpen(false);setDeleteOpen(false);setSelected([]);},[owner,id]));
 const evidence=gallery.data?.records.filter(run=>badge?.runIds.includes(run.id))??[];
 const related=badge?.definition.kind==='shape'?gallery.data?.records.filter(run=>run.courseOutcome==='finished'&&run.shape===badge.definition.shapes?.[0])??[]:evidence;
 const d=badge?.definition,milestone=d?.kind==='distance'||d?.kind==='time';
 const check=()=>{if((authentication.getSnapshot().account?.id??'')!==owner)throw new Error('계정이 바뀌었어요.');};
 const share=async()=>{
  if(working.current||!shareReady||!decorationReady||!badge?.earned)return;
  const ticket=revision.current;working.current=true;setBusy(true);setError('');let capture:string|undefined;
  const current=()=>{check();if(ticket!==revision.current)throw new Error('Cancelled');};
  try{current();capture=await captureRef(canvas,{format:'png',result:'tmpfile',width:1080,height:1620,quality:1});current();const uri=await retainCard(capture);current();await shareCardFile(uri,current);}
  catch{if(ticket===revision.current)setError('공유 이미지를 만들지 못했어요. 다시 시도해 주세요.');}
  finally{if(capture)releaseCapture(capture);working.current=false;setBusy(false);}
 };
 const remove=()=>{
  if(!selected.length||working.current)return;
  Alert.alert('선택한 러닝 기록을 삭제할까요?',`${selected.length}개 기록과 해당 GPS 경로가 삭제되고 뱃지·통계가 다시 계산됩니다. 저장한 코스는 유지됩니다.`,[
   {text:'취소',style:'cancel'},{text:'기록 삭제',style:'destructive',onPress:()=>void(async()=>{
    working.current=true;setBusy(true);setError('');let removed=0;
    try{check();const db=await getStorage();for(const runId of selected){check();if(!related.some(r=>r.id===runId))throw new Error('삭제할 기록을 다시 선택해 주세요.');await db.runs.remove(runId);removed++;}check();setDeleteOpen(false);setSelected([]);gallery.retry();}
    catch{setError(removed?`${removed}개를 삭제했지만 나머지는 삭제하지 못했어요. 목록을 다시 확인해 주세요.`:'기록을 삭제하지 못했어요. 다시 확인해 주세요.');gallery.retry();}
    finally{working.current=false;setBusy(false);}
   })()}
  ]);
 };
 return <AchievementPage title={challenge?'도전 상세':'뱃지 상세'}>
  {!gallery.data&&!gallery.error&&<ActivityIndicator accessibilityLabel="뱃지 상세 불러오는 중"/>}
  {!!(gallery.error||error)&&<AppText accessibilityRole="alert">{gallery.error||error}</AppText>}
  {!!gallery.error&&<Button label="다시 확인" onPress={gallery.retry}/>}
  {gallery.data&&!badge&&<AppText>찾을 수 없는 뱃지예요. 뱃지 보관함에서 다시 선택해 주세요.</AppText>}
  {badge&&d&&<>
   <BadgeHero badge={badge} celebrate={!challenge} challenge={challenge}/>
   {!challenge&&milestone&&<BadgeScale kind={d.kind as 'distance'|'time'} progress={d.goal}/>}
   <BadgeCondition text={d.condition}/>
   {challenge&&milestone&&<View style={{borderRadius:20,backgroundColor:c.surface,boxShadow:'0px 0px 5px rgba(0,0,0,.15)'}}><BadgeScale kind={d.kind as 'distance'|'time'} progress={badge.progress}/></View>}
   {challenge&&!milestone&&<View style={{padding:20,borderRadius:20,backgroundColor:c.surface,gap:10,boxShadow:'0px 0px 5px rgba(0,0,0,.15)'}}>
    <AppText weight="bold" style={{fontSize:28,textAlign:'center'}}>{Math.min(badge.progress,d.goal)}<AppText style={{fontSize:14,color:c.subtle}}> / {d.goal}{d.kind==='collection'||d.kind==='category'?'종 완성':'회'}</AppText></AppText>
    <View accessible accessibilityRole="progressbar" accessibilityValue={{min:0,max:d.goal,now:Math.min(badge.progress,d.goal)}} style={{height:10,borderRadius:5,backgroundColor:c.outline,overflow:'hidden'}}><View style={{height:10,width:`${Math.min(100,badge.progress/d.goal*100)}%`,borderRadius:5,backgroundColor:c.selected}}/></View>
   </View>}
   {challenge&&['shape','collection','category'].includes(d.kind)&&<View style={{gap:16}}>
    <AppText weight="bold" style={{fontSize:16}}>완주할 코스</AppText>
    {d.shapes?.map(shape=>{const done=badge.completedShapes.includes(shape),icon=SERVICE_SHAPES.find(v=>v.id===shape);return <View key={shape} style={{minHeight:70,paddingHorizontal:18,paddingVertical:10,flexDirection:'row',gap:16,alignItems:'center',backgroundColor:c.surface,borderRadius:20,boxShadow:'0px 0px 5px rgba(0,0,0,.15)'}}>
     {icon&&<GenerationIcon name={icon.id} color={done?c.selected:c.outline}/>}<AppText weight="bold" style={{flex:1,fontSize:16,color:done?c.text:c.subtle}}>{courseShapes[shape as keyof typeof courseShapes]} 코스</AppText><View style={{borderRadius:12,backgroundColor:done?c.selected:c.subtle,paddingHorizontal:10,paddingVertical:3}}><AppText weight="bold" style={{fontSize:10,lineHeight:14,color:'#FFF'}}>{done?'완주':'미완주'}</AppText></View>
    </View>;})}
   </View>}
   {challenge&&milestone&&<View style={{gap:16}}>{gallery.data?.badges.filter(b=>b.definition.kind===d.kind).map(item=><Pressable key={item.definition.id} accessibilityRole="button" disabled={!item.earned} onPress={()=>router.push({pathname:'/badge-detail',params:{id:item.definition.id}})} style={{minHeight:80,padding:12,gap:14,alignItems:'center',flexDirection:'row',borderRadius:20,backgroundColor:c.surface,boxShadow:'0px 0px 5px rgba(0,0,0,.15)'}}>
    <BadgeImage id={item.definition.id} size={60} earned={item.earned}/><AppText weight="bold" style={{flex:1,fontSize:16,color:item.earned?c.text:c.subtle}}>{item.definition.title} {item.definition.accent}</AppText><View style={{borderRadius:12,backgroundColor:item.earned?c.selected:c.subtle,paddingHorizontal:10,paddingVertical:3}}><AppText weight="bold" style={{fontSize:10,lineHeight:14,color:'#FFF'}}>{item.earned?'완료':'미완료'}</AppText></View>
   </Pressable>)}</View>}
   {!milestone&&evidence.map(run=><BadgeRunCard key={run.id} run={run}/>)}
   {challenge&&!evidence.length&&<Button variant="outline" label="코스 생성하기" onPress={()=>openServiceTab('/route-lab')}/>}
   <View style={{flex:1,minHeight:24}}/>
   <View style={{gap:20}}>
    {!challenge&&badge.earned&&<Button testID="badge-share" label="공유 하기" leading={<Icon name="share"/>} onPress={()=>{setShareReady(false);setDecorationReady(false);setShareOpen(true);}}/>}
    <Button variant="outline" label="홈으로" contentStyle={{minHeight:50,borderColor:c.outline}} labelStyle={{fontSize:16,color:c.subtle}} onPress={()=>openServiceTab('/')}/>
    <Button testID="badge-delete-records" compact variant="secondary" label="기록 삭제하기" disabled={!related.length||busy} contentStyle={{backgroundColor:'transparent'}} labelStyle={{fontSize:16,color:c.subtle}} onPress={()=>{setSelected([]);setDeleteLimit(30);setDeleteOpen(true);}}/>
   </View>
  </>}
  <AppModal visible={shareOpen&&!!badge?.earned} title="뱃지 공유" onClose={()=>{revision.current++;setShareOpen(false);}} footer={<View style={{gap:8}}><Button label="공유하기" disabled={busy||!shareReady||!decorationReady} onPress={()=>void share()}/><Button variant="secondary" label="취소" onPress={()=>{revision.current++;setShareOpen(false);}}/></View>}>
   {badge&&<View ref={canvas} collapsable={false} style={{width:shareWidth,height:shareWidth*1.5,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center',padding:20*shareScale,gap:12*shareScale}}>
    <AppText weight="black" style={{fontSize:24*shareScale,lineHeight:32*shareScale,textAlign:'center',color:'#111'}}>{badge.definition.title}{'\n'}<AppText weight="black" style={{color:'#FC5602'}}>{badge.definition.accent}</AppText> 뱃지</AppText>
    <View style={{width:248*shareScale,height:180*shareScale,alignItems:'center',justifyContent:'center'}}><Image source={require('../../../assets/achievements/confetti.png')} style={{position:'absolute',width:248*shareScale,height:180*shareScale}} contentFit="contain" onLoad={()=>setDecorationReady(true)}/><BadgeImage id={id} size={150*shareScale} onLoad={()=>setShareReady(true)}/></View>
    <AppText weight="bold" style={{fontSize:14*shareScale,lineHeight:20*shareScale,color:'#111',textAlign:'center'}}>{badge.definition.condition}</AppText>
    <AppText style={{fontSize:12*shareScale,color:'#757575'}}>{badge.earnedAt?recordDate(badge.earnedAt):''} · RunPen</AppText>
   </View>}
  </AppModal>
  <AppModal visible={deleteOpen} busy={busy} title="삭제할 러닝 기록 선택" onClose={()=>{if(!busy)setDeleteOpen(false);}} footer={<View style={{gap:8}}><Button label={`선택한 기록 ${selected.length}개 삭제`} disabled={busy||!selected.length} onPress={remove}/><Button variant="secondary" label="취소" disabled={busy} onPress={()=>setDeleteOpen(false)}/></View>}>
   <AppText variant="caption">삭제하면 해당 기록의 GPS와 요약이 사라지고 뱃지·통계가 다시 계산됩니다. 저장한 코스는 유지됩니다.</AppText>
   {related.slice(0,deleteLimit).map(run=><Pressable key={run.id} testID={`badge-delete-record-${run.id}`} accessibilityRole="checkbox" accessibilityState={{checked:selected.includes(run.id)}} disabled={busy} onPress={()=>setSelected(old=>old.includes(run.id)?old.filter(v=>v!==run.id):[...old,run.id])} style={{minHeight:60,padding:12,borderWidth:1,borderColor:selected.includes(run.id)?c.selected:c.outline,borderRadius:12,gap:4}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>{selected.includes(run.id)?<Icon name="checkboxOn" color={c.selected}/>:<View style={{width:24,height:24,borderWidth:2,borderColor:c.outline,borderRadius:4}}/>}<AppText weight="bold" style={{flex:1}}>{recordDate(run.startedAt)} · {run.courseName??'러닝'}</AppText></View><AppText variant="caption">{(run.distanceM/1000).toFixed(2)} km</AppText>
   </Pressable>)}
   {deleteLimit<related.length&&<Button compact variant="outline" label="다음 기록 보기" onPress={()=>setDeleteLimit(n=>n+30)}/>}
  </AppModal>
 </AchievementPage>;
}
