import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button } from '@/components/ui';
import type { SignInProvider } from '@/modules/auth/providers';
import { SignupBrand } from './SignupBrand';
import { SocialButton } from './SocialButton';
import { useThemeColors } from '@/theme/ThemeProvider';

export function EntryLayout({signup,ready,configured,busy,providers,provider,message,hasAccount,onSignIn,onMode,onGuest,onMembership}:{
 signup:boolean;ready:boolean;configured:boolean;busy:boolean;providers:readonly SignInProvider[];provider:SignInProvider|null;message:string;hasAccount:boolean;
 onSignIn(provider:SignInProvider):void;onMode():void;onGuest():void;onMembership():void;
}) {
 const c=useThemeColors(),window=useWindowDimensions(),insets=useSafeAreaInsets();
 const [viewport,setViewport]=useState(window.height-insets.top-insets.bottom),[content,setContent]=useState(0);
 const horizontal=window.width>=600&&window.width>window.height;
 const compact=Math.max(0,Math.min(1,(700-viewport)/140));
 const between=(normal:number,small:number)=>normal+(small-normal)*compact;
 const brandHeight=between(106,76),actionGap=between(signup?13:15,6);
 return <SafeAreaView edges={['top','bottom']} style={{flex:1,backgroundColor:c.background}}>
  <ScrollView testID="signup-entry" onLayout={e=>setViewport(e.nativeEvent.layout.height)} onContentSizeChange={(_w,h)=>setContent(h)}
   scrollEnabled={content>viewport+1} showsVerticalScrollIndicator={false}
   contentContainerStyle={{flexGrow:1,paddingHorizontal:26,paddingTop:between(50,8),paddingBottom:between(24,8),width:'100%',maxWidth:horizontal?860:412,alignSelf:'center',flexDirection:horizontal?'row':'column',gap:horizontal?24:between(27,12)}}>
   <View style={{gap:between(28,12),alignItems:'center',...(horizontal?{flex:1}:{})}}>
    <View style={{height:brandHeight,width:172,alignItems:'center',justifyContent:'center'}}><View style={{transform:[{scale:brandHeight/106}]}}><SignupBrand uncropped={!signup}/></View></View>
    <View style={{gap:signup?15:10,alignItems:'center',width:'100%'}}>
     <AppText weight={signup?'black':'medium'} style={{fontSize:signup?24:window.width<360?18:20,lineHeight:signup?29:24,textAlign:'center'}}>{signup?'RunPen 회원 가입':'나의 러닝을 작품으로 간직하세요'}</AppText>
     {signup?<View style={{gap:5,alignItems:'center'}}><AppText weight="bold" style={{color:c.selected,fontSize:16,lineHeight:25,textAlign:'center'}}>{'🎁 지금 가입하면\n러닝코스 생성 5회, 저장 10회 무료!'}</AppText><AppText style={{fontSize:14,lineHeight:20,color:c.muted,textAlign:'center'}}>회원가입하고 러닝코스 5개 무료로 만들어보세요!</AppText></View>
      :<AppText style={{fontSize:14,lineHeight:20,color:c.muted,textAlign:'center'}}>{'로그인하고, 달려온 길과 완성한 그림을\n차곡차곡 쌓아보세요.'}</AppText>}
    </View>
   </View>
   <View style={{gap:actionGap,...(horizontal?{flex:1}:{})}}>
    <View style={{gap:actionGap}}>{hasAccount?<Button label="가입 상태 확인하기" onPress={onMembership}/>:providers.map(p=><SocialButton key={p} provider={p} signup={signup} height={between(60,48)} fontSize={window.width<360?18:20} disabled={!ready||!configured||busy} busy={busy&&provider===p} onPress={()=>onSignIn(p)}/>)}</View>
    {!!message&&<AppText testID="signup-auth-message" accessibilityRole="alert">{message}</AppText>}
    {!configured&&<AppText accessibilityRole="alert">로그인 연결을 사용할 수 없어요. 앱 설정 또는 업데이트를 확인해 주세요.</AppText>}
    <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'center',minHeight:between(60,44)}}>
     <AppText style={{fontSize:14,lineHeight:20}}>{signup?'이미 계정이 있으신가요? ':'계정이 없으신가요? '}</AppText>
     <Pressable testID="signup-mode" accessibilityRole="link" accessibilityLabel={signup?'로그인':'회원가입'} accessibilityState={{disabled:busy}} disabled={busy} onPress={onMode} style={{minHeight:44,justifyContent:'center',paddingHorizontal:4}}>
      <AppText weight="bold" style={{fontSize:14,lineHeight:20,color:c.background==='#121212'?'#8CB4FF':'#0453FE',textDecorationLine:'underline'}}>{signup?'로그인':'회원가입'}</AppText>
     </Pressable>
    </View>
    {!hasAccount&&<Button testID="signup-guest" label="게스트로 입장하기" variant="outline" disabled={!ready||busy} contentStyle={{minHeight:50,borderWidth:1.5,borderColor:c.background==='#FFFFFF'?'#D9D9D9':c.outline}} labelStyle={{color:c.background==='#FFFFFF'?'#999999':c.subtle,fontSize:16}} onPress={onGuest}/>}
   </View>
  </ScrollView>
 </SafeAreaView>;
}
