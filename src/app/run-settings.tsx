import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button } from '@/components/ui';
import { SettingIcon, SettingToggle, settingCard } from '@/features/running/RunningSettingControls';
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

export default function RunSettingsScreen(){
  const insets=useSafeAreaInsets();
  const c=useThemeColors(),card={...settingCard,backgroundColor:c.surface};
  const {runId,simulation}=useLocalSearchParams<{runId?:string;simulation?:string}>(),auth=useAuth(),owner=auth.account?.id;
  const [prefs,setPrefs]=useState<AccountPreferences|null>(null),[options,setOptions]=useState<GuidanceOptions>(defaultAccountPreferences.guidance),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const saving=useRef(false),epoch=useRef(0);
  const load=useCallback(()=>{const ticket=++epoch.current;setPrefs(null);setError('');void(async()=>{try{if(simulation){const value=simulationSettings.get(simulation,owner??'');if(!value)throw new Error('expired');if(ticket===epoch.current){setPrefs({...defaultAccountPreferences,guidance:value.options});setOptions(value.options);}return;}const db=await getStorage(),p=await db.account.preferences(),g=runId?await db.runs.guidance(runId):null;if(ticket===epoch.current&&(authentication.getSnapshot().account?.id??'')===(owner??'')){setPrefs(p);setOptions(g?.options??p.guidance);}}catch{if(ticket===epoch.current)setError('러닝 설정을 불러오지 못했어요.');}})();},[owner,runId,simulation]);
  useFocusEffect(useCallback(()=>{load();return()=>{epoch.current++;};},[load]));
  async function change(next:GuidanceOptions){if(!prefs||saving.current)return;saving.current=true;setBusy(true);setError('');const ticket=epoch.current;try{if(simulation){simulationSettings.set(simulation,owner??'',next);setPrefs({...prefs,guidance:next});setOptions(next);return;}const db=await getStorage();if(ticket!==epoch.current)return;await db.account.savePreferences({...prefs,guidance:next});if(runId)await db.runs.setGuidanceOptions(runId,next);if(!next.voice)guidanceNative?.silenceLive();if(ticket===epoch.current){setPrefs({...prefs,guidance:next});setOptions(next);}}catch{if(ticket===epoch.current)setError('설정을 저장하지 못했어요. 다시 시도해 주세요.');}finally{saving.current=false;setBusy(false);}}
  function finish(){if(simulation){Alert.alert('시뮬레이션을 종료할까요?','시뮬레이션 기록을 저장하고 종료해요.',[{text:'취소',style:'cancel'},{text:'종료',onPress:()=>{simulationSettings.end(simulation,owner??'');router.back();}}]);return;}Alert.alert('러닝을 종료할까요?',runId?'현재까지의 러닝 기록을 저장하고 종료합니다.':'코스 선택 화면으로 돌아갑니다.',[{text:'취소',style:'cancel'},{text:'종료',onPress:()=>{if(!runId){openServiceTab({pathname:'/run',params:{courseId:undefined}});return;}if(saving.current)return;saving.current=true;setBusy(true);void running.finish(runId).then(async()=>{const destination=runFinishDestination(await(await getStorage()).runs.get(runId));openServiceTab({pathname:'/run',params:{courseId:undefined}});if(destination.pathname==='/run-result')router.push(destination);else openServiceTab(destination);}).catch(()=>setError('러닝을 종료하지 못했어요. 다시 시도해 주세요.')).finally(()=>{saving.current=false;setBusy(false);});}}]);}
  return <View style={{flex:1,backgroundColor:c.background}}>
    <ScrollView contentContainerStyle={{paddingHorizontal:24,paddingTop:16,paddingBottom:20,gap:12}}>
      {!prefs&&!error&&<AppText accessibilityLiveRegion="polite">설정을 불러오고 있어요.</AppText>}
      <View style={card}>
        <View style={{flexDirection:'row',gap:10,alignItems:'center'}}><SettingIcon source={require('../../assets/running/map.svg')}/><AppText weight="bold" style={{fontSize:18,lineHeight:26,flex:1}}>러닝 화면 설정</AppText></View>
        <AppText variant="caption" style={{color:c.muted}}>러닝으로 돌아가면 선택한 화면이 적용돼요.</AppText>
        <View accessibilityRole="radiogroup" style={{flexDirection:'row',gap:12}}>
          {(['map','focus'] as const).map(mode=><Pressable key={mode} accessibilityRole="radio" accessibilityLabel={mode==='map'?'지도 모드':'집중 모드'}
            accessibilityState={{checked:options.mode===mode,disabled:!prefs||busy}} disabled={!prefs||busy} onPress={()=>void change({...options,mode})}
            style={({pressed})=>({flex:1,minHeight:52,padding:10,borderRadius:12,borderWidth:2,borderColor:options.mode===mode?c.selected:c.border,backgroundColor:c.surface,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,opacity:!prefs?0.55:pressed?0.7:1})}>
            <View accessible={false} style={{width:22,height:22,borderRadius:11,borderWidth:2,borderColor:options.mode===mode?c.selected:c.outline,alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {options.mode===mode&&<View style={{width:12,height:12,borderRadius:6,backgroundColor:c.selected}}/>}
            </View>
            <AppText weight={options.mode===mode?'bold':'regular'} style={{fontSize:15,lineHeight:22,flexShrink:1}}>{mode==='map'?'지도 모드':'집중 모드'}</AppText>
          </Pressable>)}
        </View>
      </View>
      <SettingToggle testID="run-voice" label="음성 피드백" description="이동 방향과 코스 이탈을 소리로 안내해요."
        icon={require('../../assets/running/voice.svg')} checked={options.voice} disabled={!prefs||busy} onChange={voice=>void change({...options,voice})}/>
      <SettingToggle testID="run-touch-lock-setting" label="러닝 화면 잠금" description="러닝으로 돌아가면 터치를 잠가요. 길게 눌러 해제할 수 있어요."
        icon={require('../../assets/running/lock.svg')} checked={options.touchLock??false} disabled={!prefs||busy} onChange={touchLock=>void change({...options,touchLock})}/>
      {!!error&&<AppText accessibilityRole="alert" style={{color:c.danger}}>{error}</AppText>}
      {!prefs&&!!error&&<Button compact label="설정 다시 불러오기" onPress={load}/>}
    </ScrollView>
    <View style={{paddingHorizontal:24,paddingTop:12,paddingBottom:12+insets.bottom,gap:8,borderTopWidth:1,borderTopColor:c.divider,backgroundColor:c.surface}}>
      <AppText variant="caption" accessibilityLiveRegion="polite" style={{color:c.muted,textAlign:'center'}}>{busy?'설정 저장 중…':'설정은 변경하면 자동으로 저장돼요.'}</AppText>
      <Button label="러닝으로 돌아가기" disabled={busy} onPress={()=>router.back()}/>
      <Button label="러닝 종료하기" variant="secondary" disabled={!prefs||busy} onPress={finish}/>
    </View>
  </View>;
}
