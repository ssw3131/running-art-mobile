import { Image } from 'expo-image';
import { View } from 'react-native';
import { AppModal, AppText, Button } from '@/components/ui';
import { useUsage } from '@/features/usage/use-usage';
import { useThemeColors } from '@/theme/ThemeProvider';
export function RegenerationSheet({visible,count,onClose,onConfirm}:{visible:boolean;count:number;onClose():void;onConfirm():void}){
  const c=useThemeColors(),usage=useUsage(),remaining=usage.data?Math.max(0,usage.data.generation.total-usage.data.generation.used):null;
  return <AppModal visible={visible} presentation="sheet" sheetHandle dismissOnBackdrop title={'추천 코스를 삭제하고\n재생성할까요?'} onClose={onClose} footer={<View style={{gap:6}}>
    <Button testID="regeneration-confirm" label="코스 생성하기" disabled={remaining===null||remaining===0} leading={<Image source={require('../../../assets/generation/confirmation/generate.svg')} style={{width:20,height:20}}/>} onPress={onConfirm}/>
    <Button variant="secondary" label="취소" onPress={onClose}/>
  </View>}>
    <AppText style={{fontSize:12,lineHeight:18,textAlign:'center',color:c.subtle}}>{`현재 추천된 코스 ${count}개는 삭제되며,\n다시 확인할 수 없어요.`}</AppText>
    <View style={{width:'100%',maxWidth:288,backgroundColor:c.background==='#FFFFFF'?'#FFEDE8':'#39241E',borderRadius:16,padding:16,gap:8}}>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:20}}>
        <View style={{alignItems:'center'}}><AppText style={{fontSize:10}}>현재 남은 횟수</AppText><AppText weight="black" style={{fontSize:32,lineHeight:40,color:c.selected}}>{remaining??'—'}<AppText style={{fontSize:14}}>회</AppText></AppText></View>
        <Image source={require('../../../assets/generation/confirmation/arrow.svg')} style={{width:24,height:24}}/>
        <View style={{alignItems:'center'}}><AppText style={{fontSize:10}}>생성 후</AppText><AppText weight="black" style={{fontSize:32,lineHeight:40,color:c.selected}}>{remaining===null?'—':Math.max(0,remaining-1)}<AppText style={{fontSize:14}}>회</AppText></AppText></View>
      </View><AppText style={{fontSize:10,textAlign:'center',color:c.subtle}}>재생성 시 1회 차감</AppText>
    </View>
    {!!usage.error&&<Button compact variant="outline" label="횟수 다시 확인" onPress={()=>void usage.refresh()}/>}
    {remaining===0&&<AppText accessibilityRole="alert">사용 가능한 생성 횟수를 모두 사용했어요.</AppText>}
  </AppModal>;
}
