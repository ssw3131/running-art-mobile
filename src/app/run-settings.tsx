import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, Icon } from '@/components/ui';
import { Toggle } from '@/components/ui/ChoiceControl';
import { getStorage } from '@/modules/storage/database';
import { defaultAccountPreferences, type AccountPreferences } from '@/modules/account/model';
import type { GuidanceOptions } from '@/modules/running/guidance';
import { running } from '@/modules/running/runtime';
import { guidanceNative } from '@/modules/guidance/native';
import { authentication } from '@/modules/auth/runtime';
import { openServiceTab } from '@/features/service/open-service-tab';
import { useThemeColors } from '@/theme/ThemeProvider';
import { simulationSettings } from '@/features/running/simulation-settings';
import { runFinishDestination } from '@/modules/running/finish-destination';
import { useAuth } from '@/features/auth/use-auth';

const cardBase={padding:20,borderRadius:20,gap:16,backgroundColor:'#FFFFFF',boxShadow:'0px 0px 10px rgba(0,0,0,0.12)'} as const;
export default function RunSettingsScreen(){
  const insets=useSafeAreaInsets();
  const c=useThemeColors(),card={...cardBase,backgroundColor:c.surface};
  const {runId,simulation}=useLocalSearchParams<{runId?:string;simulation?:string}>(),auth=useAuth(),owner=auth.account?.id;
  const [prefs,setPrefs]=useState<AccountPreferences|null>(null),[options,setOptions]=useState<GuidanceOptions>(defaultAccountPreferences.guidance),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const saving=useRef(false),epoch=useRef(0);
  useFocusEffect(useCallback(()=>{const ticket=++epoch.current;setPrefs(null);setError('');void(async()=>{try{if(simulation){const value=simulationSettings.get(simulation,owner??'');if(!value)throw new Error('expired');if(ticket===epoch.current){setPrefs({...defaultAccountPreferences,guidance:value.options});setOptions(value.options);}return;}const db=await getStorage(),p=await db.account.preferences(),g=runId?await db.runs.guidance(runId):null;if(ticket===epoch.current&&(authentication.getSnapshot().account?.id??'')===(owner??'')){setPrefs(p);setOptions(g?.options??p.guidance);}}catch{if(ticket===epoch.current)setError('러닝 설정을 불러오지 못했어요.');}})();return()=>{epoch.current++;};},[owner,runId,simulation]));
  async function change(next:GuidanceOptions){if(!prefs||saving.current)return;saving.current=true;setBusy(true);setError('');const ticket=epoch.current;try{if(simulation){simulationSettings.set(simulation,owner??'',next);setPrefs({...prefs,guidance:next});setOptions(next);return;}const db=await getStorage();if(ticket!==epoch.current)return;await db.account.savePreferences({...prefs,guidance:next});if(runId)await db.runs.setGuidanceOptions(runId,next);if(!next.voice)guidanceNative?.silenceLive();if(ticket===epoch.current){setPrefs({...prefs,guidance:next});setOptions(next);}}catch{if(ticket===epoch.current)setError('설정을 저장하지 못했어요. 다시 시도해 주세요.');}finally{saving.current=false;setBusy(false);}}
  function finish(){if(simulation){Alert.alert('시뮬레이션을 종료할까요?','실제 러닝 기록은 저장하지 않습니다.',[{text:'취소',style:'cancel'},{text:'종료',onPress:()=>{simulationSettings.end(simulation,owner??'');router.back();}}]);return;}Alert.alert('러닝을 종료할까요?',runId?'현재까지의 러닝 기록을 저장하고 종료합니다.':'코스 선택 화면으로 돌아갑니다.',[{text:'취소',style:'cancel'},{text:'종료',onPress:()=>{if(!runId){openServiceTab({pathname:'/run',params:{courseId:undefined}});return;}if(saving.current)return;saving.current=true;setBusy(true);void running.finish(runId).then(async()=>{const destination=runFinishDestination(await(await getStorage()).runs.get(runId));openServiceTab({pathname:'/run',params:{courseId:undefined}});if(destination.pathname==='/run-result')router.push(destination);else openServiceTab(destination);}).catch(()=>setError('러닝을 종료하지 못했어요. 다시 시도해 주세요.')).finally(()=>{saving.current=false;setBusy(false);});}}]);}
  return <ScrollView style={{flex:1,backgroundColor:c.background}} contentContainerStyle={{paddingHorizontal:32,paddingTop:40,paddingBottom:24+insets.bottom,gap:16,flexGrow:1}}>
    <View style={card}>
      <View style={{flexDirection:'row',gap:10,alignItems:'center'}}><Image source={require('../../assets/running/map.svg')} style={{width:24,height:24}}/><View style={{flex:1,gap:3}}><AppText weight="bold" style={{fontSize:20}}>러닝 화면 설정</AppText><AppText style={{fontSize:12,color:c.muted}}>러닝 중 어떤 화면을 기본으로 할지 설정합니다.</AppText></View></View>
      <View accessibilityRole="radiogroup" style={{flexDirection:'row',justifyContent:'space-between',gap:20}}>{(['map','focus'] as const).map(mode=><Pressable key={mode} accessibilityRole="radio" accessibilityLabel={mode==='map'?'지도 모드':'집중 모드'} accessibilityState={{checked:options.mode===mode,disabled:!prefs||busy}} disabled={!prefs||busy} onPress={()=>void change({...options,mode})} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:7}}><Image source={options.mode===mode?require('../../assets/running/radio-on.svg'):require('../../assets/running/radio-off.svg')} style={{width:24,height:24}} accessible={false}/><AppText style={{fontSize:16}}>{mode==='map'?'지도 모드':'집중 모드'}</AppText></Pressable>)}</View>
    </View>
    <Pressable testID="run-voice" accessibilityRole="switch" accessibilityLabel="음성 피드백" accessibilityState={{checked:options.voice,disabled:!prefs||busy}} disabled={!prefs||busy} onPress={()=>void change({...options,voice:!options.voice})} style={{...card,flexDirection:'row',alignItems:'center',gap:10,minHeight:98,paddingVertical:15}}><Image source={require('../../assets/running/voice.svg')} style={{width:24,height:24}}/><View style={{flex:1,gap:3}}><AppText weight="bold" style={{fontSize:20}}>음성 피드백</AppText><AppText style={{fontSize:12,color:c.muted}}>이동 방향과 코스 이탈을 안내합니다.</AppText></View><Icon name={options.voice?'switchOn':'switchOff'}/></Pressable>
    <Pressable testID="run-touch-lock-setting" accessibilityRole="switch" accessibilityLabel="러닝 화면 잠금" accessibilityState={{checked:options.touchLock??false,disabled:!prefs||busy}} disabled={!prefs||busy} onPress={()=>void change({...options,touchLock:!options.touchLock})} style={{...card,flexDirection:'row',alignItems:'center',gap:10,minHeight:98,paddingVertical:15}}><Image source={require('../../assets/running/lock.svg')} style={{width:24,height:24}}/><View style={{flex:1,gap:3}}><AppText weight="bold" style={{fontSize:20}}>러닝 화면 잠금</AppText><AppText style={{fontSize:12,color:c.muted}}>길게 눌러 화면 잠금을 해제할 수 있어요.</AppText></View><Icon name={options.touchLock?'switchOn':'switchOff'}/></Pressable>
    <View style={card}><Toggle testID="run-background" label="화면 꺼짐 중 안내·기록" checked={options.background} disabled={!prefs||busy} onChange={background=>void change({...options,background})}/><AppText variant="caption">끄면 화면을 잠그거나 다른 앱으로 이동할 때 일시정지해요.</AppText></View>
    {!!error&&<AppText accessibilityRole="alert">{error}</AppText>}<View style={{flex:1,minHeight:24}}/>
    <Button label="러닝으로 돌아가기" trailing={<Icon name="chevronRight" color="#FFFFFF"/>} disabled={busy} onPress={()=>router.back()}/><Button label="러닝 종료하기" variant="secondary" disabled={busy} onPress={finish}/>
  </ScrollView>;
}
