import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui';

export function ModeSwitch({ focus, onChange }: { focus: boolean; onChange(): void }) {
  return <Pressable testID="run-guidance-mode" accessibilityRole="button" accessibilityLabel={focus?'지도 모드로 전환':'집중 모드로 전환'} onPress={onChange}
    style={{position:'absolute',top:'44%',...(focus?{left:0}:{right:0}),width:32,height:112,borderTopLeftRadius:focus?0:12,borderBottomLeftRadius:focus?0:12,borderTopRightRadius:focus?12:0,borderBottomRightRadius:focus?12:0,backgroundColor:'#0D213C',justifyContent:'center',alignItems:'center'}}>
    <Image source={require('../../../assets/running/mode-chevron.svg')} style={{width:30,height:48,transform:focus?[{scaleX:-1}]:[]}} accessible={false}/>
  </Pressable>;
}
export function RunningControls({ busy, paused, preparation=false, canStart=true, onSettings, onStartPause, onFinish }: {
  busy:boolean; paused:boolean; preparation?:boolean; canStart?:boolean; onSettings():void; onStartPause():void; onFinish():void;
}) {
  return <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:16,paddingHorizontal:26,paddingTop:12,paddingBottom:29}}>
    <Pressable testID="run-guidance-settings" accessibilityRole="button" accessibilityLabel="러닝 설정" disabled={busy} onPress={onSettings} style={{width:50,height:50,borderRadius:25,backgroundColor:'#FFFFFF',justifyContent:'center',alignItems:'center',boxShadow:'0px 0px 10px rgba(0,0,0,0.15)'}}><Image source={require('../../../assets/running/settings.svg')} style={{width:18,height:18}} accessible={false}/></Pressable>
    <Pressable testID={preparation?'run-course-start':paused?'run-start':'run-pause'} accessibilityRole="button" accessibilityLabel={preparation?'러닝 시작':paused?'러닝 재개':'일시정지'} disabled={busy||!canStart} onPress={onStartPause} style={{flex:1,minHeight:preparation?70:50,borderRadius:35,backgroundColor:preparation?'#FC5602':'#0D213C',flexDirection:'row',gap:12,alignItems:'center',justifyContent:'center',opacity:busy||!canStart?.45:1,boxShadow:'0px 0px 20px rgba(0,0,0,0.2)'}}>
      {!paused&&!preparation&&<View accessible={false} style={{flexDirection:'row',gap:5}}><View style={{width:7,height:24,backgroundColor:'#D9D9D9'}}/><View style={{width:7,height:24,backgroundColor:'#D9D9D9'}}/></View>}
      {preparation&&<Image source={require('../../../assets/running/play.svg')} style={{width:22.6985,height:26}} accessible={false}/>}
      <AppText weight="bold" style={{color:'#FFFFFF',fontSize:20}}>{preparation?(busy?'준비 중':'시작'):paused?'재개':'일시정지'}</AppText>
    </Pressable>
    <Pressable testID="run-finish" accessibilityRole="button" accessibilityLabel="러닝 종료" disabled={busy} onPress={onFinish} style={{width:preparation?70:50,minHeight:preparation?70:50,borderRadius:35,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center',gap:5}}><View accessible={false} style={{width:preparation?20:15,height:preparation?20:15,backgroundColor:'#0D213C'}}/><AppText weight="bold" style={{color:'#0D213C',fontSize:preparation?14:12,lineHeight:18}}>종료</AppText></Pressable>
  </View>;
}
