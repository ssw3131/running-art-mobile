import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { AppText, Button, Icon } from '@/components/ui';
import { Toggle } from '@/components/ui/ChoiceControl';
import { getStorage } from '@/modules/storage/database';
import { defaultAccountPreferences, type AccountPreferences } from '@/modules/account/model';
import type { GuidanceOptions } from '@/modules/running/guidance';
import { running } from '@/modules/running/runtime';
import { guidanceNative } from '@/modules/guidance/native';
import { authentication } from '@/modules/auth/runtime';
import { useAuth } from '@/features/auth/use-auth';

const card={padding:20,borderRadius:20,gap:16,backgroundColor:'#FFFFFF',boxShadow:'0px 0px 10px rgba(0,0,0,0.12)'} as const;
export default function RunSettingsScreen(){
  const {runId}=useLocalSearchParams<{runId?:string}>(),auth=useAuth(),owner=auth.account?.id;
  const [prefs,setPrefs]=useState<AccountPreferences|null>(null),[options,setOptions]=useState<GuidanceOptions>(defaultAccountPreferences.guidance),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const saving=useRef(false),epoch=useRef(0);
  useFocusEffect(useCallback(()=>{const ticket=++epoch.current;setPrefs(null);setError('');void(async()=>{try{const db=await getStorage(),p=await db.account.preferences(),g=runId?await db.runs.guidance(runId):null;if(ticket===epoch.current&&(authentication.getSnapshot().account?.id??'')===(owner??'')){setPrefs(p);setOptions(g?.options??p.guidance);}}catch{if(ticket===epoch.current)setError('러닝 설정을 불러오지 못했어요.');}})();return()=>{epoch.current++;};},[owner,runId]));
  async function change(next:GuidanceOptions){if(!prefs||saving.current)return;saving.current=true;setBusy(true);setError('');const ticket=epoch.current;try{const db=await getStorage();if(ticket!==epoch.current)return;await db.account.savePreferences({...prefs,guidance:next});if(runId)await db.runs.setGuidanceOptions(runId,next);if(!next.voice)guidanceNative?.silenceLive();if(ticket===epoch.current){setPrefs({...prefs,guidance:next});setOptions(next);}}catch{if(ticket===epoch.current)setError('설정을 저장하지 못했어요. 다시 시도해 주세요.');}finally{saving.current=false;setBusy(false);}}
  function finish(){Alert.alert('러닝을 종료할까요?',runId?'현재까지의 러닝 기록을 저장하고 종료합니다.':'코스 선택 화면으로 돌아갑니다.',[{text:'취소',style:'cancel'},{text:'종료',onPress:()=>{if(!runId){router.replace('/run');return;}if(saving.current)return;saving.current=true;setBusy(true);void running.finish(runId).then(()=>router.replace({pathname:'/run-result',params:{id:runId}}),()=>setError('러닝을 종료하지 못했어요. 다시 시도해 주세요.')).finally(()=>{saving.current=false;setBusy(false);});}}]);}
  return <ScrollView style={{flex:1,backgroundColor:'#FFFFFF'}} contentContainerStyle={{paddingHorizontal:32,paddingTop:40,paddingBottom:24,gap:16,flexGrow:1}}>
    <View style={card}><View style={{flexDirection:'row',gap:10,alignItems:'center'}}><Image source={require('../../assets/running/map.svg')} style={{width:24,height:24}}/><AppText weight="bold" style={{fontSize:20}}>러닝 화면</AppText></View><AppText variant="caption">러닝 시작 시 기본 화면을 선택해 주세요.</AppText><View style={{flexDirection:'row',gap:24}}>{(['map','focus'] as const).map(mode=><Button key={mode} compact variant={options.mode===mode?'primary':'outline'} label={mode==='map'?'지도 모드':'집중 모드'} disabled={!prefs||busy} onPress={()=>void change({...options,mode})}/>)}</View></View>
    <View style={card}><Toggle testID="run-voice" label="음성 피드백" checked={options.voice} disabled={!prefs||busy} onChange={voice=>void change({...options,voice})}/><AppText variant="caption">이동 방향과 코스 이탈을 음성으로 안내해요.</AppText></View>
    <View style={card}><Toggle testID="run-touch-lock-setting" label="러닝 화면 잠금" checked={options.touchLock??false} disabled={!prefs||busy} onChange={touchLock=>void change({...options,touchLock})}/><AppText variant="caption">러닝 화면에서 길게 눌러 잠금을 해제할 수 있어요.</AppText></View>
    <View style={card}><Toggle testID="run-background" label="화면 꺼짐 중 안내·기록" checked={options.background} disabled={!prefs||busy} onChange={background=>void change({...options,background})}/><AppText variant="caption">끄면 화면을 잠그거나 다른 앱으로 이동할 때 일시정지해요.</AppText></View>
    {!!error&&<AppText accessibilityRole="alert">{error}</AppText>}<View style={{flex:1,minHeight:24}}/>
    <Button label="러닝으로 돌아가기" trailing={<Icon name="chevronRight" color="#FFFFFF"/>} disabled={busy} onPress={()=>router.back()}/><Button label="러닝 종료하기" variant="outline" disabled={busy} onPress={finish}/>
  </ScrollView>;
}
