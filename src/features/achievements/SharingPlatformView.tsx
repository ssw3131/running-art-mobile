import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { AppText, Button } from '@/components/ui';
import { AchievementImage as Image } from './AchievementImage';
import type { CardContent } from '@/modules/achievements/card';
import type { RunResult } from './use-run-result';
import { openServiceTab } from '@/features/service/open-service-tab';
import RunSharePanel from '@/features/running/RunSharePanel';
import { useThemeColors } from '@/theme/ThemeProvider';
type Platform='instagram'|'story'|'link'|'save';
const tabs=[['instagram','인스타그램',require('../../../assets/achievements/sharing-20261109/instagram.png')],['story','인스타스토리',require('../../../assets/achievements/sharing-20261109/story.png')],['link','링크 공유',require('../../../assets/achievements/sharing-20261109/link.png')],['save','이미지 저장',require('../../../assets/achievements/sharing-20261109/image.png')]] as const;
export function SharingPlatformView({id,platform,choose,format,setFormat,busy,content,data,error,retry,uri,imageReady,imageLocked,assetError,message,reload,onBusy,onAction,canvas}:{id:string;platform:Platform;choose(value:Platform):void;format:'square'|'story';setFormat(value:'square'|'story'):void;busy:boolean;content:CardContent|null;data:RunResult|null;error:string;retry():void;uri:string|null;imageReady:boolean;imageLocked:boolean;assetError:boolean;message:string;reload():void;onBusy(value:boolean):void;onAction():void;canvas:ReactNode}){
 const c=useThemeColors(),{width}=useWindowDimensions(),portrait=format==='story';
 const previewWidth=portrait?Math.min(234,width-88):Math.min(316,width-96),previewHeight=previewWidth*(portrait?16/9:1);
 return <ScrollView testID="run-card-content" style={{backgroundColor:c.background}} contentContainerStyle={{paddingHorizontal:24,paddingTop:31,paddingBottom:44,gap:31,width:'100%',maxWidth:412,alignSelf:'center'}}>
  <Stack.Screen options={{title:'공유하기'}}/>
  {!data&&!error&&<ActivityIndicator accessibilityLabel="카드 기록 확인 중"/>}
  {!!error&&<><AppText accessibilityRole="alert">{error}</AppText><Button label="다시 불러오기" onPress={retry}/></>}
  {content&&<>
   <View style={{alignItems:'center',gap:6}}><AppText family="roboto" weight="semibold" style={{fontSize:24,lineHeight:32,textAlign:'center'}}>어디에 공유할까요?</AppText><AppText style={{fontSize:12,lineHeight:18,color:c.subtle,textAlign:'center'}}>공유할 곳을 선택하면 알맞은 형식으로 준비해요.</AppText></View>
   <View accessibilityRole="tablist" style={{flexDirection:'row',gap:8}}>{tabs.map(([value,label,asset])=><Pressable key={value} testID={`share-platform-${value}`} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected:platform===value,disabled:busy}} disabled={busy} onPress={()=>choose(value)} style={{flex:1,minHeight:83,borderRadius:14,borderWidth:1.5,borderColor:platform===value?c.selected:'transparent',backgroundColor:platform===value?'#FFF1E9':c.navigation,alignItems:'center',paddingTop:11,gap:22}}><Image source={asset} style={{width:value==='save'?26:24,height:value==='save'?26:24}} contentFit="contain" tintColor={value==='link'||value==='save'?platform===value?c.selected:c.text:undefined}/><AppText weight={platform===value?'bold':'regular'} style={{fontSize:10,lineHeight:15,color:platform===value?'#D94700':c.muted}}>{label}</AppText></Pressable>)}</View>
   <View style={{gap:3}}><AppText weight="bold" style={{fontSize:18,lineHeight:26}}>{platform==='link'?'링크로 기록을 공유해요':'이미지로 기록을 공유해요'}</AppText><AppText style={{fontSize:12,lineHeight:20,color:c.muted}}>{platform==='link'?'앱이 없어도 링크에서 완주 기록을 볼 수 있어요.':platform==='save'?'원하는 비율을 골라 기기에 저장하세요.':platform==='story'?'스토리에 맞는 세로형 이미지로 준비했어요.':'인스타그램에 맞는 정사각형 이미지로 준비했어요.'}</AppText></View>
   {platform==='save'&&<View style={{gap:8}}><AppText weight="bold" style={{fontSize:14,color:c.muted}}>이미지 비율</AppText><View style={{flexDirection:'row',gap:8}}>{(['square','story'] as const).map(value=><Pressable key={value} testID={`card-format-${value}`} accessibilityRole="radio" accessibilityLabel={value==='square'?'정사각형 1:1':'세로형 9:16'} accessibilityState={{checked:format===value,disabled:busy}} disabled={busy} onPress={()=>setFormat(value)} style={{flex:1,minHeight:42,borderWidth:1,borderColor:format===value?c.selected:'transparent',borderRadius:14,backgroundColor:format===value?'#FFF1E9':c.navigation,alignItems:'center',justifyContent:'center'}}><AppText weight="bold" style={{fontSize:14,color:c.muted}}>{value==='square'?'정사각형 1:1':'세로형 9:16'}</AppText></Pressable>)}</View></View>}
   {platform==='link'?<>
    <LinkPreview content={content}/><RunSharePanel card="platform" id={id} disabled={busy} onBusy={onBusy}/>
   </>:<>
    <View style={{backgroundColor:c.navigation,borderRadius:16,paddingVertical:portrait?20:24,paddingHorizontal:20,minHeight:previewHeight+(portrait?48:66),alignItems:'center'}}>
     {uri?<Image testID="card-png-preview" source={{uri}} style={{width:previewWidth,height:previewHeight,borderRadius:14}} contentFit="contain" onError={reload}/>:<View style={{width:previewWidth,height:previewHeight,borderRadius:14,overflow:'hidden'}}><View style={{width:360,height:portrait?640:360,transformOrigin:'top left',transform:[{scale:previewWidth/360}]}}>{canvas}</View></View>}
    </View>
    <View style={{gap:5,marginTop:-16}}><AppText style={{fontSize:11,lineHeight:20,color:c.subtle}}>{portrait?'스토리 · 9:16 · 1080 × 1920 px':'정사각형 · 1:1 · 1080 × 1080 px'}</AppText>{platform!=='save'&&<AppText style={{fontSize:12,lineHeight:20,color:c.muted}}>{platform==='story'?'스토리에서 이미지에 문구나 스티커를 더해 보세요.':'인스타그램에서 이미지를 확인하고 게시해 주세요.'}</AppText>}</View>
    {!imageReady&&!assetError&&<View testID="card-loading" style={{flexDirection:'row',gap:8,alignItems:'center'}}><ActivityIndicator color={c.action}/><AppText variant="caption">공유할 이미지를 불러오고 있어요.</AppText></View>}
    {assetError&&<Button label="카드 이미지 다시 불러오기" variant="outline" onPress={reload}/>}
    {!!message&&<AppText testID="card-message" accessibilityRole="alert" variant="caption">{message}</AppText>}
    <View style={{marginTop:20}}><Button testID={platform==='save'?'card-save':platform==='story'?'card-story':'card-share'} label={platform==='save'?'이미지 저장하기':platform==='story'?'인스타 스토리로 공유 하기':'인스타그램으로 공유 하기'} disabled={imageLocked} loading={busy} labelStyle={{fontSize:20}} onPress={onAction}/></View>
   </>}
   <Button label="홈으로" variant="outline" labelStyle={{fontSize:16,color:c.subtle}} contentStyle={{minHeight:50}} onPress={()=>openServiceTab('/')}/>
  </>}
 </ScrollView>;
}
function LinkPreview({content}:{content:CardContent}){
 const c=useThemeColors();
 return <View testID="share-link-preview" style={{padding:24,paddingTop:16,borderRadius:16,backgroundColor:c.navigation,gap:18}}><AppText weight="bold" style={{fontSize:11,color:c.subtle,textAlign:'right'}}>공유될 링크 미리보기</AppText><View style={{borderRadius:14,borderWidth:1,borderColor:c.divider,backgroundColor:c.surface,padding:14,gap:8}}><View style={{flexDirection:'row',alignItems:'center'}}><View style={{flex:1}}><AppText weight="bold" style={{fontSize:16}}>달린 길 — RunPen</AppText><AppText style={{fontSize:12,color:c.subtle}}>달리기로 그린 길</AppText></View><AppText style={{fontSize:9,padding:5,borderRadius:8,backgroundColor:c.navigation,color:c.muted}}>웹페이지</AppText></View>{content.mapUri||content.pathUri?<Image source={{uri:content.mapUri??content.pathUri!}} style={{width:'100%',height:110,borderRadius:8,backgroundColor:'#EFF4F3'}} contentFit={content.mapUri?'cover':'contain'}/>:null}<AppText weight="bold" style={{fontSize:11}}>계획한 모양 위에, 직접 달린 발자취.</AppText><View style={{flexDirection:'row',gap:6,alignItems:'center'}}><Image source={require('../../../assets/achievements/sharing-20261109/map.svg')} style={{width:20,height:20}}/><AppText style={{fontSize:10,color:c.subtle}}>전체 경로 보기</AppText></View></View></View>;
}
