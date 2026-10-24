import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { AppModal, AppText, Button } from '@/components/ui';
import { useThemeColors } from '@/theme/ThemeProvider';
import { useUsage } from './use-usage';
export function UsagePanel({compact=false}:{compact?:boolean}) {
  const c=useThemeColors(),usage=useUsage(),[open,setOpen]=useState(false);
  const count=(kind:'generation'|'save')=>usage.data?`${usage.data[kind].used}/${usage.data[kind].total}`:'—';
  const save=usage.data?.save,percent=save?Math.min(100,save.total>0?Math.round(save.used/save.total*100):100):0;
  return <>
    {compact?<View style={{flexDirection:'row',alignItems:'center',gap:14,flexWrap:'wrap'}}>
      {(['generation','save'] as const).map(kind=><Pressable key={kind} testID={`usage-${kind}`} accessibilityRole="button" accessibilityLabel={`${kind==='generation'?'생성':'저장'} 사용 횟수 ${count(kind)}, 이용 안내`} onPress={()=>setOpen(true)} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:6}}>
        <Image source={kind==='generation'?require('../../../assets/archive/wand.svg'):require('../../../assets/archive/archive.svg')} style={{width:20,height:20}} contentFit="contain" accessible={false}/>
        <AppText weight="bold" family="roboto">{count(kind)}</AppText>
      </Pressable>)}
    </View>:<View testID="archive-usage" style={{backgroundColor:c.background==='#121212'?'#39241E':'#FFEEE9',borderRadius:20,padding:20,gap:6}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10}}><AppText variant="caption" weight="bold" style={{color:c.selected}}>저장 횟수</AppText><Pressable accessibilityRole="button" onPress={()=>setOpen(true)} style={{paddingHorizontal:12,minHeight:36,borderRadius:20,backgroundColor:c.action,justifyContent:'center'}}><AppText variant="caption" weight="bold" style={{color:c.onAction}}>이용 안내</AppText></Pressable></View>
      <AppText weight="bold"><AppText family="roboto" weight="bold" style={{fontSize:24,color:c.selected}}>{count('save')}</AppText> 회 사용</AppText>
      <View style={{flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1,height:10,borderRadius:5,backgroundColor:c.outline,overflow:'hidden'}}><View style={{height:10,width:`${percent}%`,backgroundColor:c.action}}/></View><AppText variant="caption">{save?`${percent}%`:'—'}</AppText></View>
      <AppText variant="caption" style={{color:c.muted}}>코스를 삭제해도 사용한 저장 횟수는 돌아오지 않아요.</AppText>
      {!!usage.error&&<Pressable onPress={()=>void usage.refresh()} accessibilityRole="button"><AppText variant="caption">횟수 확인에 실패했어요. 다시 확인</AppText></Pressable>}
    </View>}
    <AppModal visible={open} title="생성·저장 이용 안내" presentation="sheet" onClose={()=>setOpen(false)} footer={<Button label="확인" onPress={()=>setOpen(false)}/>}>
      <AppText>생성 {count('generation')}회 · 저장 {count('save')}회 사용</AppText>
      <AppText variant="caption">생성은 후보를 받은 계산당 1회, 저장은 새 코스당 1회 사용해요. 삭제해도 저장 횟수는 돌아오지 않아요.</AppText>
      <AppText weight="bold">추가 이용권 구매는 준비 중입니다.</AppText>
      {!!usage.error&&<><AppText accessibilityRole="alert" variant="caption">{usage.error}</AppText><Button label="횟수 다시 확인" variant="outline" onPress={()=>void usage.refresh()}/></>}
    </AppModal>
  </>;
}
