import { useCallback,useRef,useState,useSyncExternalStore } from 'react';
import { ActivityIndicator,Alert,AppState,Linking,Platform,Pressable,ScrollView,TextInput,View } from 'react-native';
import { Image } from 'expo-image';
import { router,useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { AppModal,AppText,Button,Icon } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { authentication } from '@/modules/auth/runtime';
import { personalSync } from '@/modules/sync/runtime';
import { providerLabel,type AccountPreferences } from '@/modules/account/model';
import { signInProviderLabels } from '@/modules/auth/providers';
import { accountWithdrawal } from '@/modules/account/withdrawal-runtime';
import { parseWeightKg } from '@/modules/running/calories';
import { getStorage } from '@/modules/storage/database';
import { useAccountData } from './use-account';
import { ProfileAvatar,useAccountColors,type AccountColors } from './ui';
import { useMembership } from '@/features/membership/use-membership';
import { useAchievements } from '@/features/achievements/use-achievements';
import { badgeCatalog } from '@/modules/achievements/catalog';
import { BadgeImage } from '@/features/achievements/BadgeImage';
import { useUsage } from '@/features/usage/use-usage';

const assets={
 voice:{source:require('../../../assets/achievements/figma-20261108/voice.svg'),width:24,height:24},
 location:{source:require('../../../assets/achievements/figma-20261108/location.svg'),width:24,height:24},
 theme:{source:require('../../../assets/achievements/figma-20261108/theme.svg'),width:24,height:24},
 payment:{source:require('../../../assets/achievements/figma-20261108/payment.svg'),width:24,height:24},
 document:{source:require('../../../assets/achievements/figma-20261108/document.svg'),width:24,height:24},
 withdraw:{source:require('../../../assets/achievements/figma-20261108/withdraw.svg'),width:16,height:16},
 distance:{source:require('../../../assets/achievements/figma-20261108/distance.svg'),width:20,height:20},
 trophy:{source:require('../../../assets/achievements/figma-20261108/trophy.svg'),width:16,height:16},
 timer:{source:require('../../../assets/achievements/figma-20261108/timer.svg'),width:16,height:16},
 archive:{source:require('../../../assets/achievements/figma-20261108/archive.svg'),width:16,height:16},
 wand:{source:require('../../../assets/achievements/figma-20261108/wand.svg'),width:16,height:16},
};
function AccountIcon({name,color}:{name:keyof typeof assets;color?:string}){const a=assets[name];return <Image source={a.source} tintColor={color} style={{width:a.width,height:a.height}} accessible={false}/>;}
function AccountToggleRow({id,title,description,icon,value,ready,onPress,colors:c}:{id:string;title:string;description:string;icon:'voice'|'location';value:boolean;ready:boolean;onPress():void;colors:AccountColors}){
 return <View style={{flexDirection:'row',gap:18,alignItems:'flex-start'}}><AccountIcon name={icon} color={c.text}/><View style={{flex:1,gap:4}}><AppText weight="bold" style={{fontSize:18,lineHeight:26,color:c.text}}>{title}</AppText><AppText style={{fontSize:12,lineHeight:17,color:c.muted}}>{description}</AppText></View><Pressable testID={id} accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{checked:value,disabled:!ready}} disabled={!ready} onPress={onPress} style={{minHeight:48,justifyContent:'center'}}><Icon name={value?'switchOn':'switchOff'}/></Pressable></View>;
}
export default function AccountScreen(){
 const auth=useAuth(),data=useAccountData(),registration=useMembership(),achievements=useAchievements(),usage=useUsage();
 const withdrawal=useSyncExternalStore(accountWithdrawal.subscribe,accountWithdrawal.getSnapshot,accountWithdrawal.getSnapshot);
 const sync=useSyncExternalStore(personalSync.subscribe,personalSync.getSnapshot,personalSync.getSnapshot);
 const c=useAccountColors(data.preferences.theme),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[info,setInfo]=useState(''),[permission,setPermission]=useState<boolean|null>(null);
 const [weightOpen,setWeightOpen]=useState(false),[weightDraft,setWeightDraft]=useState(''),[weightError,setWeightError]=useState('');
 const working=useRef(false),owner=auth.account?.id??'';
 const ready=data.ready&&!busy&&auth.ready&&!auth.busy;
 const effectiveTheme=data.preferences.theme==='system'?(c.background==='#FFFFFF'?'light':'dark'):data.preferences.theme;
 const refreshPermissions=useCallback(async()=>{try{if(Platform.OS!=='web')setPermission((await Location.getForegroundPermissionsAsync()).granted);}catch{setPermission(null);}},[]);
 useFocusEffect(useCallback(()=>{void refreshPermissions();const listener=AppState.addEventListener('change',value=>{if(value==='active')void refreshPermissions();});return()=>listener.remove();},[refreshPermissions]));
 const save=async(next:AccountPreferences)=>{
  if(working.current||!ready)return false;working.current=true;setBusy(true);setMessage('');
  try{if((authentication.getSnapshot().account?.id??'')!==owner)return false;const store=await getStorage();if((authentication.getSnapshot().account?.id??'')!==owner)return false;
   const saved=await store.account.savePreferences(next);if((authentication.getSnapshot().account?.id??'')!==owner)return false;data.setPreferences(saved);return true;
  }catch{setMessage('설정을 저장하지 못했어요. 다시 시도해 주세요.');return false;}finally{working.current=false;setBusy(false);}
 };
 const applyWeight=async()=>{
  try{const weightKg=parseWeightKg(weightDraft),next={...data.preferences};if(weightKg===undefined)delete next.weightKg;else next.weightKg=weightKg;
   if(await save(next))setWeightOpen(false);else setWeightError('체중을 저장하지 못했어요. 다시 시도해 주세요.');
  }catch(error){setWeightError(error instanceof Error?error.message:'체중을 확인해 주세요.');}
 };
 const changeLocation=async()=>{
  if(busy||Platform.OS==='web')return;setBusy(true);setMessage('');
  try{const current=await Location.getForegroundPermissionsAsync();if(current.granted||!current.canAskAgain)await Linking.openSettings();else await Location.requestForegroundPermissionsAsync();await refreshPermissions();}
  catch{setMessage('위치 권한을 변경하지 못했어요. 기기의 앱 설정을 확인해 주세요.');}finally{setBusy(false);}
 };
 const signOut=()=>Alert.alert('로그아웃할까요?',`이 기기의 로그인만 종료합니다. 저장된 코스와 러닝 기록은 유지됩니다.${sync.status?.pending?` 아직 전송하지 않은 변경 ${sync.status.pending}건도 기기에 남습니다.`:''}`,[{text:'취소',style:'cancel'},{text:'로그아웃',onPress:()=>{void authentication.signOut();}}]);
 const earnedIds=new Set([...(achievements.data?.badges.map(b=>b.shape)??[]),...(achievements.data?.awards?.map(a=>a.id)??[])]);
 const previews=[...badgeCatalog.filter(b=>earnedIds.has(b.id)),...badgeCatalog.filter(b=>!earnedIds.has(b.id))].slice(0,4);
 const remaining=(kind:'generation'|'save')=>usage.data?Math.max(0,usage.data[kind].total-usage.data[kind].used):'—';
 const card={borderRadius:20,padding:22,gap:20,backgroundColor:c.surface,boxShadow:'0px 0px 10px rgba(0,0,0,.15)'};
 const providerIcon=(provider:string)=>provider==='google'?require('../../../assets/signup/google.png'):provider==='kakao'?require('../../../assets/signup/kakao.svg'):provider==='custom:naver'?require('../../../assets/signup/naver.svg'):null;
 const row=(id:string,title:string,icon:keyof typeof assets,onPress:()=>void,accent=false)=><Pressable key={id} testID={id} accessibilityRole="button" onPress={onPress} style={{minHeight:44,flexDirection:'row',gap:15,alignItems:'center'}}>
  <AccountIcon name={icon} color={accent?c.accent:c.muted}/><AppText weight="medium" style={{fontSize:16,lineHeight:24,color:accent?c.accent:c.text,flex:1}}>{title}</AppText><Image source={require('../../../assets/achievements/figma-20261108/chevron.svg')} style={{width:30,height:30}} accessible={false}/>
 </Pressable>;
 return <View style={{flex:1,backgroundColor:c.background}}><ScrollView testID="account-main-scroll" contentContainerStyle={{padding:24,gap:28,paddingBottom:40,maxWidth:680,width:'100%',alignSelf:'center'}}>
  <View style={{...card,padding:16,gap:20}}>
   <View style={{flexDirection:'row',gap:20,alignItems:'center'}}>
    <ProfileAvatar account={auth.account} colors={c} size={80}/>
    <View style={{flex:1,gap:6}}>
     <View style={{flexDirection:'row',gap:6,alignItems:'center',flexWrap:'wrap'}}><AppText testID="account-name" weight="bold" style={{fontSize:20,lineHeight:30,color:c.text,flexGrow:1}}>{auth.account?.name??'RunPen'}</AppText>{auth.account&&<Pressable testID="edit-profile" accessibilityRole="button" onPress={()=>router.push('/account-profile')} style={{borderRadius:15,backgroundColor:c.border,paddingLeft:10,minHeight:28,flexDirection:'row',alignItems:'center'}}><AppText style={{fontSize:12,lineHeight:18,color:c.muted}}>프로필 편집</AppText><Image source={require('../../../assets/achievements/figma-20261108/profile-chevron.svg')} style={{width:22,height:20}}/></Pressable>}</View>
     <AppText style={{fontSize:16,lineHeight:23,color:c.muted}}>{auth.account?`${auth.account.providers.map(providerLabel).join(' · ')} 계정과 연결됨`:'로그인하고 내 기록을 이어가세요.'}</AppText>
    </View>
   </View>
   <View style={{backgroundColor:'#FEF2EC',borderRadius:10,padding:14,gap:12}}>
    <View style={{flexDirection:'row',gap:8,alignItems:'center'}}><AppText weight="bold" style={{fontSize:20,lineHeight:28,color:'#111'}}>기본 팩</AppText><View style={{borderWidth:1,borderColor:c.accent,borderRadius:10,paddingHorizontal:8}}><AppText weight="bold" style={{fontSize:12,color:c.accent}}>이용중</AppText></View><View style={{flex:1}}/><Pressable testID="account-packs" accessibilityRole="button" onPress={()=>setInfo('팩 구매 / 추가 혜택')} style={{backgroundColor:c.accent,borderRadius:20,paddingHorizontal:12,paddingVertical:4}}><AppText weight="bold" style={{fontSize:12,color:'#FFF'}}>팩 구매 ›</AppText></Pressable></View>
    <View style={{flexDirection:'row',gap:8}}>
     <View style={{flex:1,backgroundColor:'#FFD0B94D',borderRadius:5,paddingVertical:5,paddingHorizontal:6,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4}}><AccountIcon name="wand"/><AppText weight="bold" style={{fontSize:12,color:'#AB7C64'}}>코스 생성 <AppText weight="black" style={{fontSize:14,color:c.accent}}>{remaining('generation')}회</AppText></AppText></View>
     <View style={{flex:1,backgroundColor:'#FFD0B94D',borderRadius:5,paddingVertical:5,paddingHorizontal:6,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4}}><AccountIcon name="archive"/><AppText weight="bold" style={{fontSize:12,color:'#AB7C64'}}>보관함 <AppText weight="black" style={{fontSize:14,color:c.accent}}>{remaining('save')}개</AppText></AppText></View>
    </View>
   </View>
   {!auth.account&&<Button testID="account-signup" label="회원가입 · 로그인 안내" disabled={!auth.ready||auth.busy} onPress={()=>router.push('/account-entry')}/>}
   {!auth.account&&auth.providers.map(provider=><Button key={provider} testID={`${provider.replace('custom:','')}-sign-in`} label={`${signInProviderLabels[provider]}로 계속하기`} disabled={!auth.ready||auth.busy||!auth.configured} onPress={()=>{void authentication.signIn(provider);}}/>)}
   {!!auth.account&&registration.owner===owner&&registration.status!=='complete'&&<Button testID="account-consent" compact variant="outline" label="가입 정보 · 약관 확인" onPress={()=>router.push('/account-signup')}/>}
   {(auth.busy||!auth.ready)&&<ActivityIndicator accessibilityLabel="계정 처리 중"/>}
   {!!auth.message&&<AppText testID="auth-message" accessibilityRole="alert">{auth.message}</AppText>}
   {withdrawal.complete&&!auth.account&&<AppText accessibilityRole="alert">{withdrawal.message}</AppText>}
  </View>
  <View testID="account-statistics" style={{flexDirection:'row',gap:8}}>
   {[{label:'총 누적 거리',icon:'distance' as const,value:data.statistics?(data.statistics.distanceM/1000).toFixed(1):'—',unit:'km',flex:1.1},{label:'완주 횟수',icon:'trophy' as const,value:data.statistics?String(data.statistics.finishedCourses):'—',unit:'회',flex:.85},{label:'총 러닝 시간',icon:'timer' as const,value:data.statistics?`${Math.floor(data.statistics.activeMs/3600000)}`:'—',unit:data.statistics?`시간 ${Math.floor(data.statistics.activeMs/60000)%60}분`:'시간',flex:1.35}].map(stat=><View key={stat.label} style={{flex:stat.flex,backgroundColor:c.background==='#FFFFFF'?'#F4F6FA':c.surface,borderRadius:14,minHeight:64,paddingVertical:10,paddingHorizontal:4,gap:5,alignItems:'center',justifyContent:'center'}}>
    <View style={{flexDirection:'row',gap:4,alignItems:'center'}}><AccountIcon name={stat.icon}/><AppText weight="bold" style={{fontSize:11,lineHeight:16,color:c.muted}}>{stat.label}</AppText></View><AppText weight="black" numberOfLines={1} adjustsFontSizeToFit style={{fontSize:18,lineHeight:25,color:c.text}}>{stat.value}<AppText weight="medium" style={{fontSize:12}}> {stat.unit}</AppText></AppText>
   </View>)}
  </View>
  <View style={{gap:15}}><View style={{flexDirection:'row',alignItems:'center'}}><AppText weight="bold" style={{fontSize:18,lineHeight:26,color:c.text,flex:1}}>내 완주 배지</AppText><Pressable testID="account-badges" accessibilityRole="button" onPress={()=>router.push('/badges')} style={{minHeight:48,flexDirection:'row',gap:4,alignItems:'center'}}><AppText weight="medium" style={{fontSize:16,color:c.muted}}>뱃지 보관함</AppText><Image source={require('../../../assets/achievements/figma-20261108/badge-chevron.svg')} style={{width:20,height:20}}/></Pressable></View>
   <View style={{flexDirection:'row',gap:10,justifyContent:'space-between',flexWrap:'wrap'}}>{previews.map(b=><Pressable key={b.id} testID={`account-badge-${b.id}`} accessibilityRole="button" accessibilityLabel={`${b.title} ${b.accent}`} disabled={!earnedIds.has(b.id)} onPress={()=>router.push({pathname:'/badge-detail',params:{id:b.id}})}><BadgeImage id={b.id} size={68} earned={earnedIds.has(b.id)}/></Pressable>)}</View>
   {!!achievements.error&&<Button testID="achievements-retry" compact variant="outline" label="뱃지 다시 확인" onPress={achievements.retry}/>}
  </View>
  <View style={{...card,padding:30,gap:28}}>
   <AccountToggleRow id="setting-voice" title="음성 피드백" description="거리, 페이스, 방향 등을 음성으로 안내합니다." icon="voice" value={data.preferences.guidance.voice} ready={ready} colors={c} onPress={()=>void save({...data.preferences,guidance:{...data.preferences.guidance,voice:!data.preferences.guidance.voice}})}/>
   <AccountToggleRow id="setting-location" title="위치 권한" description="코스 탐색과 러닝 기록에 필요한 위치 권한을 확인해요." icon="location" value={permission===true} ready={ready} colors={c} onPress={()=>void changeLocation()}/>
   <View style={{gap:12}}><View style={{flexDirection:'row',gap:18}}><AccountIcon name="theme" color={c.text}/><View style={{flex:1,gap:4}}><AppText weight="bold" style={{fontSize:18,lineHeight:26,color:c.text}}>화면 테마</AppText><AppText style={{fontSize:12,lineHeight:17,color:c.muted}}>내 취향에 맞게 밝은 화면과 어두운 화면을 선택해요.</AppText></View></View>
    <View style={{flexDirection:'row',justifyContent:'space-around',gap:12}}>{(['light','dark'] as const).map(theme=><Pressable key={theme} testID={`theme-${theme}`} accessibilityRole="radio" accessibilityState={{selected:effectiveTheme===theme,disabled:!ready}} disabled={!ready} onPress={()=>void save({...data.preferences,theme})} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:6}}><View style={{width:20,height:20,borderRadius:10,borderWidth:2,borderColor:effectiveTheme===theme?c.accent:c.border,alignItems:'center',justifyContent:'center'}}>{effectiveTheme===theme&&<View style={{width:10,height:10,borderRadius:5,backgroundColor:c.accent}}/>}</View><AppText weight="medium" style={{fontSize:16,color:c.text}}>{theme==='light'?'화이트 모드':'다크 모드'}</AppText></Pressable>)}</View>
   </View>
  </View>
  <View style={{...card,padding:24,gap:10}}><View style={{flexDirection:'row',alignItems:'center',gap:12}}><AppText weight="bold" style={{fontSize:18,color:c.text,flex:1}}>체중 · 칼로리 계산</AppText><Pressable testID="account-weight" accessibilityRole="button" accessibilityLabel="칼로리 계산용 체중 설정" disabled={!ready} onPress={()=>{setWeightDraft(data.preferences.weightKg===undefined?'':String(data.preferences.weightKg));setWeightError('');setWeightOpen(true);}} style={{minHeight:48,paddingHorizontal:12,justifyContent:'center'}}><AppText weight="bold" style={{fontSize:16,color:c.accent}}>{data.ready&&data.preferences.weightKg!==undefined?`${data.preferences.weightKg} kg`:'설정'}</AppText></Pressable></View><AppText style={{fontSize:12,lineHeight:18,color:c.muted}}>체중과 완주 거리로 예상 칼로리를 계산해요. 미입력 시 기본 60kg을 사용해요.</AppText></View>
  {!!(message||data.error)&&<AppText accessibilityRole="alert" style={{color:c.danger}}>{message||data.error}</AppText>}
  {!!data.error&&<Button testID="account-retry" label="다시 불러오기" onPress={data.reload}/>}
  <View style={{...card,padding:30,gap:15}}><AppText weight="bold" style={{fontSize:18,color:c.text}}>이용 및 결제</AppText>
   <View>{row('account-benefits','팩 구매 / 추가 혜택 보기','payment',()=>setInfo('팩 구매 / 추가 혜택'),true)}{row('account-purchases','구매 내역','document',()=>setInfo('구매 내역'))}{row('account-refunds','결제 및 환불 안내','document',()=>setInfo('결제 및 환불 안내'))}</View>
  </View>
  <View style={{...card,padding:30,gap:22}}><View style={{flexDirection:'row',gap:16}}><Icon name="map"/><View style={{flex:1,gap:5}}><AppText weight="bold" style={{fontSize:18,color:c.text}}>계정 관리</AppText><AppText style={{fontSize:12,lineHeight:18,color:c.muted}}>연결된 계정을 확인하고 로그인이나 회원 탈퇴를 관리해요.</AppText></View></View>
   <View style={{gap:10}}><AppText weight="bold" style={{fontSize:14,color:c.text}}>연결된 계정</AppText>
    {auth.account?.providers.map(provider=><Pressable key={provider} testID="account-sync" accessibilityRole="button" accessibilityLabel="개인 기록 동기화 관리" onPress={()=>router.push('/account-sync')} style={{minHeight:44,flexDirection:'row',gap:8,alignItems:'center',borderBottomWidth:1,borderColor:c.border,paddingBottom:12}}>
     {!!providerIcon(provider)&&<Image source={providerIcon(provider)} style={{width:provider==='kakao'?26:provider==='custom:naver'?22:24,height:provider==='kakao'?25:provider==='custom:naver'?22:24}} contentFit="contain"/>}<AppText weight="medium" style={{fontSize:14,color:c.text,flex:1}}>{providerLabel(provider)}</AppText><View style={{backgroundColor:'#13C776',borderRadius:10,paddingHorizontal:8,paddingVertical:2}}><AppText weight="bold" style={{fontSize:12,color:'#FFF'}}>연결됨</AppText></View>
    </Pressable>)}
    {!auth.account&&<AppText style={{fontSize:14,color:c.muted}}>연결된 계정이 없어요.</AppText>}
    {auth.account&&<View style={{paddingVertical:8,borderBottomWidth:1,borderColor:c.border,gap:4}}><Pressable testID="sign-out" accessibilityRole="button" disabled={auth.busy} onPress={signOut} style={{flexDirection:'row',gap:8,alignItems:'center',minHeight:40}}><Icon name="logout"/><AppText weight="bold" style={{fontSize:14,color:c.text,flex:1}}>로그아웃</AppText><Image source={require('../../../assets/achievements/figma-20261108/chevron.svg')} style={{width:30,height:30}}/></Pressable><AppText style={{fontSize:12,lineHeight:18,color:c.muted,marginLeft:24}}>다시 로그인 하면 저장된 기록을 확인할 수 있어요.</AppText></View>}
    {(auth.account||withdrawal.pending||!withdrawal.ready)&&<View style={{paddingTop:8,gap:4}}><Pressable testID="account-withdraw" accessibilityRole="button" disabled={auth.busy} onPress={()=>router.push('/account-withdraw')} style={{flexDirection:'row',gap:8,alignItems:'center',minHeight:40}}><AccountIcon name="withdraw"/><AppText weight="bold" style={{fontSize:14,color:c.accent,flex:1}}>{withdrawal.pending?'탈퇴 요청 확인':'회원 탈퇴'}</AppText><Image source={require('../../../assets/achievements/figma-20261108/chevron.svg')} style={{width:30,height:30}}/></Pressable><AppText style={{fontSize:12,lineHeight:18,color:c.muted,marginLeft:24}}>탈퇴 전 안내 사항을 꼭 확인해주세요.</AppText></View>}
   </View>
  </View>
  <AppModal visible={weightOpen} title="칼로리 계산용 체중" busy={busy} onClose={()=>{if(!busy)setWeightOpen(false);}} footer={<View style={{gap:8}}><Button testID="save-weight" label="저장" disabled={busy||!data.ready} onPress={()=>void applyWeight()}/><Button variant="secondary" label="취소" disabled={busy} onPress={()=>setWeightOpen(false)}/></View>}>
   <AppText style={{fontSize:14,lineHeight:22}}>체중(kg)</AppText><TextInput testID="body-weight-input" accessibilityLabel="체중 kg" value={weightDraft} onChangeText={value=>{setWeightDraft(value);setWeightError('');}} editable={!busy} keyboardType="decimal-pad" maxLength={6} placeholder="예: 65.5" placeholderTextColor={c.muted} style={{width:'100%',minHeight:52,borderRadius:10,borderWidth:1,borderColor:c.border,padding:12,fontSize:20,color:c.text}}/>
   <AppText style={{fontSize:12,lineHeight:18,color:c.muted}}>10~500kg · 소수점 한 자리까지 입력해요. 비워서 저장하면 체중을 삭제해요.</AppText>
   <AppText style={{fontSize:12,lineHeight:18,color:c.muted}}>체중은 이 기기의 계정별 설정에만 저장돼요. 서버나 공유 카드로 전송하지 않아요.</AppText>
   <AppText style={{fontSize:12,lineHeight:18,color:c.muted}}>칼로리는 체중 × 실제 거리(km)로 계산한 참고용 추정치예요. 과거 기록도 현재 설정 체중으로 다시 계산하며 경사·개인차는 반영하지 않아요.</AppText>
   {!!weightError&&<AppText accessibilityRole="alert" style={{color:c.danger}}>{weightError}</AppText>}
  </AppModal>
  <AppModal visible={!!info} title={info} onClose={()=>setInfo('')} footer={<Button label="확인" onPress={()=>setInfo('')}/>}>
   {info==='팩 구매 / 추가 혜택'?<><AppText>코스 생성 {remaining('generation')}회 · 추가 저장 {remaining('save')}회 이용할 수 있어요.</AppText><AppText>추가 이용권 구매는 준비 중입니다.</AppText></>:<AppText>현재 앱에는 결제 기능이 연결되어 있지 않아 구매 내역과 결제·환불 정보를 조회할 수 없어요.</AppText>}
  </AppModal>
 </ScrollView></View>;
}
