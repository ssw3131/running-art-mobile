import type { CardContent } from '@/modules/achievements/card';
import { LinkPreview } from '@/features/achievements/ShareLinkPreview';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Clipboard, Pressable, Share, Text, View } from 'react-native';
import { AchievementImage as Image } from '@/features/achievements/AchievementImage';
import { AppText, Button } from '@/components/ui';
import { useThemeColors } from '@/theme/ThemeProvider';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { authentication } from '@/modules/auth/runtime';
import { runSharing } from '@/modules/run-sharing/runtime';
import { shareErrorMessage } from '@/modules/run-sharing/model';
import { ServiceTabLink } from '@/features/service/ServiceTabLink';
import { RunButton, useRunStyles } from './ui';

export default function RunSharePanel({ id, disabled, onBusy, card=false, previewContent }: { id: string; disabled: boolean; onBusy(value: boolean): void;card?:boolean|'platform';previewContent?:CardContent }) {
  const styles = useRunStyles(),c=useThemeColors();
  const account = useSyncExternalStore(authentication.subscribe, authentication.getSnapshot).account;
  const owner = account?.id ?? '';
  const [state, setState] = useState<{ key: string; url: string | null; message: string }>({ key: '', url: null, message: '' });
  const key = `${owner}/${id}`;
  const url = state.key === key ? state.url : null, message = state.key === key ? state.message : '';
  const loading = !!runSharing && !!owner && state.key !== key;
  const setMessage = (value: string) => setState(previous => ({ key, url: previous.key === key ? previous.url : null, message: value }));
  const setUrl = (value: string | null) => setState(previous => ({ key, url: value, message: previous.key === key ? previous.message : '' }));
  const generation = useRef(0), working = useRef(false);
  useEffect(() => {
    const current = ++generation.current; let cancelled = false;
    if (runSharing && owner) void (async()=>{
      const existing=await runSharing.current(id,owner);
      if(cancelled)return null;
      return existing??(card==='platform'?await runSharing.publish(id,owner):null);
    })().then(
      result => { if (!cancelled) setState({ key, url: result, message: '' }); },
      error => { if (!cancelled) setState({ key, url: null, message: shareErrorMessage(error) }); },
    );
    return () => { cancelled = true; generation.current = current + 1; };
  }, [id, owner, key, card]);
  async function act(action: 'share' | 'revoke' | 'copy' | 'open' | 'prepare') {
    if (!runSharing || !owner || working.current) return;
    const current = generation.current;
    working.current = true; onBusy(true); setMessage('');
    try {
      if (action === 'revoke') {
        await runSharing.revoke(id, owner);
        if (current === generation.current) { setUrl(null); setMessage('공유를 중단했어요. 기존 링크로 다시 열 수 없어요.'); }
      } else {
        // Server confirmation every time handles revocation from another device.
        const link = action==='open'&&url?url:await runSharing.publish(id, owner);
        if (current !== generation.current) return;
        setUrl(link);
        if(action==='prepare')return;
        if(action==='open'){await WebBrowser.openBrowserAsync(link);return;}
        if(action==='copy'){Clipboard.setString(link);setMessage('링크를 복사했어요.');return;}
        const result = await Share.share({ title: 'RunPen 러닝 경로', message: `RunPen에서 달린 경로를 확인해 보세요.\n${link}` });
        if (current === generation.current) setMessage(result.action === Share.dismissedAction ? '공유 창을 닫았어요. 만든 링크는 유지되며 아래에서 공유를 중단할 수 있어요.' : '공유 창을 열었어요. 링크를 가진 사람은 이 경로를 볼 수 있어요.');
      }
    } catch (error) { if (current === generation.current) setMessage(shareErrorMessage(error)); }
    finally { working.current = false; onBusy(false); }
  }
  const locked = disabled || loading || !runSharing || !owner;
  const confirm=(action:'share'|'copy'|'open')=>Alert.alert('이 러닝 경로를 공유할까요?','실제 경로와 계획 코스·코스 이름·거리·활동 시간이 링크를 가진 사람에게 공개됩니다. 언제든 공유를 중단할 수 있어요.',[{text:'취소',style:'cancel'},{text:'공유',onPress:()=>void act(action)}]);
  const open=()=>void act('open');
  if(card)return <View style={{paddingHorizontal:card==='platform'?0:20,paddingVertical:card==='platform'?0:22,borderRadius:20,gap:20,backgroundColor:c.surface,boxShadow:card==='platform'?'none':'0px 0px 5px rgba(0,0,0,0.2)'}}>
    {previewContent&&<LinkPreview content={previewContent} onOpen={open} disabled={locked}/>}
    {card!=='platform'&&<View style={{flexDirection:'row',gap:10}}><Image source={require('../../../assets/achievements/sharing/link.svg')} style={{width:34,height:34}}/><View style={{flex:1,gap:3}}><AppText weight="bold" style={{fontSize:16,lineHeight:23}}>링크로 공유</AppText><AppText style={{fontSize:12,lineHeight:18,color:c.muted}}>앱이 없어도 웹에서 기록을 볼 수 있어요.</AppText></View></View>}
    {card==='platform'&&<AppText weight="bold" style={{fontSize:14,color:c.muted}}>공유 링크</AppText>}{!runSharing&&<AppText>링크 공유 서비스를 준비하고 있어요.</AppText>}<>
      <Pressable testID="run-share-link" accessibilityRole="button" accessibilityLabel="카카오톡으로 링크 공유" disabled={locked} onPress={()=>confirm('share')} style={{borderRadius:15,borderWidth:1,borderColor:c.border,backgroundColor:c.navigation,padding:10,paddingLeft:20,flexDirection:'row',alignItems:'center',gap:10,opacity:locked?.45:1}}><Image source={require('../../../assets/achievements/sharing-20261109/kakao.svg')} style={{width:40,height:40}}/><AppText weight="bold" style={{flex:1,fontSize:14}}>카카오톡으로 링크 공유</AppText><Image source={require('../../../assets/achievements/sharing-20261109/chevron.svg')} style={{width:30,height:30}}/></Pressable>
      <View style={{flexDirection:'row',borderRadius:8,borderWidth:1,borderColor:c.border,paddingHorizontal:10,alignItems:'center',gap:8}}><Image source={require('../../../assets/achievements/sharing/link.svg')} style={{width:20,height:20}}/><AppText testID="run-share-url" selectable style={{flex:1,fontSize:11,lineHeight:17,paddingVertical:10,color:c.muted}}>{loading?'공유 링크를 확인하고 있어요.':url??'링크를 준비하지 못했어요. 다시 시도해 주세요.'}</AppText><Pressable testID="run-share-copy" accessibilityRole="button" accessibilityLabel="링크 복사" disabled={locked} onPress={()=>confirm('copy')} style={{minHeight:44,flexDirection:'row',gap:3,alignItems:'center'}}><Image source={require('../../../assets/achievements/sharing/copy.svg')} style={{width:16,height:16}}/><AppText style={{fontSize:12,color:c.selected}}>링크복사</AppText></Pressable></View>
      <View style={{flexDirection:'row',gap:6}}><Image source={require('../../../assets/achievements/sharing/info.svg')} style={{width:16,height:16}}/><AppText style={{flex:1,fontSize:11,lineHeight:16,color:c.muted}}>공유 창에서 카카오톡을 선택해 주세요. 링크를 받은 사람은 앱 없이 기록을 볼 수 있어요.</AppText></View>
      {url&&<Button compact variant="outline" label="공유 중단" disabled={locked} onPress={()=>Alert.alert('공유를 중단할까요?','기존 링크를 더 이상 열 수 없습니다.',[{text:'취소',style:'cancel'},{text:'공유 중단',style:'destructive',onPress:()=>void act('revoke')}])}/>}
    </>
    {!!message&&<AppText accessibilityRole="alert" style={{fontSize:12}}>{message}</AppText>}
    {!loading&&!url&&card==='platform'&&<Button compact variant="outline" testID="run-share-prepare" label="공유 링크 다시 준비" disabled={locked} onPress={()=>void act('prepare')}/>}
  </View>;
  return <View style={styles.card}>
    <Text style={styles.title}>경로 링크 공유</Text>
    <Text style={styles.body}>실제 달린 경로와 출발 당시 계획 코스·원래 도형을 함께 보여줘요. 공유 링크를 가진 사람은 로그인 없이 볼 수 있어요.</Text>
    {!runSharing ? <Text style={styles.body}>링크 공유 서비스를 준비하고 있어요.</Text> : !owner ? <ServiceTabLink href="/account" style={styles.link}>로그인하고 내 기록 공유하기</ServiceTabLink> : <>
      <Text style={styles.body}>{loading ? '공유 상태를 확인하고 있어요.' : url ? '이 기록의 공유 링크가 있어요.' : '공유하기를 누르면 이 기록의 링크를 만들어요.'}</Text>
      <RunButton id="run-share-link" title={url ? '링크 다시 공유' : '링크로 공유'} disabled={locked} onPress={() => Alert.alert('이 러닝 경로를 공유할까요?', '실제 경로와 계획 코스·원래 도형, 코스 이름·거리·활동 시간이 링크를 가진 사람에게 공개됩니다. 언제든 공유를 중단할 수 있어요.', [
        { text: '취소', style: 'cancel' }, { text: '공유', onPress: () => void act('share') },
      ])} />
      <RunButton id="run-share-revoke" title="공유 중단" disabled={locked} onPress={() => Alert.alert('공유를 중단할까요?', '이 기록의 기존 링크를 더 이상 열 수 없게 됩니다. 다시 공유하면 새 링크를 만들어요.', [
        { text: '취소', style: 'cancel' }, { text: '공유 중단', style: 'destructive', onPress: () => void act('revoke') },
      ])} />
      <Link href="/account-sync" style={styles.link}>기록 동기화 확인</Link>
    </>}
    {!!message && <Text accessibilityRole="alert" style={styles.body}>{message}</Text>}
  </View>;
}
