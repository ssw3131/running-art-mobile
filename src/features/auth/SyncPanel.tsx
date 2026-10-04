import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { personalSync } from '@/modules/sync/runtime';
import type { SyncConflict } from '@/modules/sync/repository';
import { lightAccountColors, type AccountColors } from '../account/ui';

export function SyncPanel({ colors = lightAccountColors }: { colors?: AccountColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const state=useSyncExternalStore(personalSync.subscribe,personalSync.getSnapshot,personalSync.getSnapshot);
  useEffect(()=>{void personalSync.refresh();},[]);
  if (!state.owner) return null;
  const status=state.status;
  const enable=(claim:boolean)=>Alert.alert(claim?'기기 기록을 이 계정에 연결':'개인 기록 동기화 켜기',
    claim ? `계정에 연결되지 않은 코스 ${status?.guestCourses??0}개와 완료된 러닝 ${status?.guestRuns??0}건을 현재 계정에 연결하고 RunPen의 비공개 서버에 저장합니다. 로그아웃하면 숨겨지며 같은 계정으로 다시 로그인하면 사용할 수 있습니다.`
      : '이 계정의 코스와 완료된 러닝을 RunPen의 비공개 서버에 저장하고 다른 기기의 기록을 복원합니다. 계정에 연결되지 않은 기기 기록은 그대로 유지합니다.',
    [{text:'취소',style:'cancel'},{text:claim?'연결하고 동기화':'켜기',onPress:()=>{void personalSync.enable(claim);}}]);
  const resolve=(conflict:SyncConflict,choice:'local'|'remote')=>Alert.alert('동기화 충돌 해결',
    choice==='local'?'이 기기의 변경을 서버에 반영합니다. 이 기기에서 삭제한 기록이면 서버에도 삭제를 반영합니다.'
      :conflict.remote.deleted?'서버에서 삭제된 기록입니다. 이 기기의 같은 기록도 삭제합니다.':'이 기기의 같은 기록을 서버 내용으로 바꿉니다.',
    [{text:'취소',style:'cancel'},{text:'적용',onPress:()=>{void personalSync.resolve(conflict,choice);}}]);
  const button=(title:string,action:()=>void,id:string)=><Pressable testID={id} accessibilityRole="button" accessibilityState={{disabled:state.busy}}
    disabled={state.busy} onPress={action} style={[styles.button,state.busy&&styles.disabled]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
  return <View style={styles.card}>
    <Text style={styles.title}>개인 기록 동기화</Text>
    <Text style={styles.body}>코스와 러닝은 먼저 기기에 저장합니다. 동기화를 켜면 앱 사용 중 인터넷이 연결될 때 전송을 다시 시도합니다.</Text>
    {status&&<>
      <Text testID="sync-status" style={styles.body}>{status.enabled?'동기화 켜짐':'동기화 꺼짐'} · 전송 대기 {status.pending}건</Text>
      <Text style={styles.body}>{status.lastSuccess?`마지막 완료: ${new Date(status.lastSuccess).toLocaleString('ko-KR')}`:'아직 서버에 동기화를 완료하지 않았습니다.'}</Text>
      {status.enabled ? <>
        {button('지금 동기화',()=>{void personalSync.sync();},'sync-now')}
        {button('자동 동기화 끄기',()=>{void personalSync.disable();},'sync-disable')}
      </>:button('개인 기록 동기화 켜기',()=>enable(false),'sync-enable')}
      {(status.guestCourses+status.guestRuns)>0&&<>
        <Text style={styles.body}>계정에 연결되지 않은 기기 코스 {status.guestCourses}개 · 러닝 {status.guestRuns}건</Text>
        {button('기기 기록을 이 계정에 연결',()=>enable(true),'sync-claim')}
      </>}
      {status.conflicts.map(conflict=><View key={`${conflict.kind}/${conflict.id}`} style={styles.conflict}>
        <Text style={styles.body}>{conflict.kind==='course'?'코스':'러닝'} 변경 충돌 · {conflict.remote.deleted?'서버에서 삭제됨':conflict.kind==='course'&&conflict.remote.summary&&'name' in conflict.remote.summary?conflict.remote.summary.name:'서버에서도 변경됨'}</Text>
        {button('이 기기의 변경 유지',()=>resolve(conflict,'local'),`sync-local-${conflict.id}`)}
        {button('서버 내용 사용',()=>resolve(conflict,'remote'),`sync-remote-${conflict.id}`)}
      </View>)}
    </>}
    {state.busy&&<ActivityIndicator accessibilityLabel="기록 동기화 중" color={colors.accent}/>}
    {!status && !state.busy && button('동기화 상태 다시 확인',()=>{void personalSync.refresh();},'sync-status-retry')}
    {!!state.message&&<Text testID="sync-message" accessibilityRole="alert" style={styles.body}>{state.message}</Text>}
    <Text style={styles.body}>연결한 기록은 이 계정에서만 볼 수 있습니다. 다른 기기에서도 같은 계정으로 로그인하고 동기화를 켜면 복원됩니다.</Text>
  </View>;
}
const createStyles=(colors:AccountColors)=>StyleSheet.create({card:{backgroundColor:colors.surface,borderRadius:24,padding:24,gap:16},title:{color:colors.text,fontSize:22,fontWeight:'700'},
  body:{color:colors.muted,fontSize:16,lineHeight:25},button:{backgroundColor:colors.accent,borderRadius:14,padding:16,alignItems:'center'},
  buttonText:{color:colors.onAccent,fontSize:15,fontWeight:'600'},disabled:{opacity:0.5},conflict:{borderTopWidth:1,borderColor:colors.border,paddingTop:16,gap:12}});
