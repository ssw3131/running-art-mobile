import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { authentication } from '@/modules/auth/runtime';
import { runSharing } from '@/modules/run-sharing/runtime';
import { shareErrorMessage } from '@/modules/run-sharing/model';
import { RunButton, styles } from './ui';

export default function RunSharePanel({ id, disabled, onBusy }: { id: string; disabled: boolean; onBusy(value: boolean): void }) {
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
    if (runSharing && owner) void runSharing.current(id, owner).then(
      result => { if (!cancelled) setState({ key, url: result, message: '' }); },
      error => { if (!cancelled) setState({ key, url: null, message: shareErrorMessage(error) }); },
    );
    return () => { cancelled = true; generation.current = current + 1; };
  }, [id, owner, key]);
  async function act(action: 'share' | 'revoke') {
    if (!runSharing || !owner || working.current) return;
    const current = generation.current;
    working.current = true; onBusy(true); setMessage('');
    try {
      if (action === 'revoke') {
        await runSharing.revoke(id, owner);
        if (current === generation.current) { setUrl(null); setMessage('공유를 중단했어요. 기존 링크로 다시 열 수 없어요.'); }
      } else {
        // Server confirmation every time handles revocation from another device.
        const link = await runSharing.publish(id, owner);
        if (current !== generation.current) return;
        setUrl(link);
        const result = await Share.share({ title: 'RunPen 러닝 경로', message: `RunPen에서 달린 경로를 확인해 보세요.\n${link}` });
        if (current === generation.current) setMessage(result.action === Share.dismissedAction ? '공유 창을 닫았어요. 만든 링크는 유지되며 아래에서 공유를 중단할 수 있어요.' : '공유 창을 열었어요. 링크를 가진 사람은 이 경로를 볼 수 있어요.');
      }
    } catch (error) { if (current === generation.current) setMessage(shareErrorMessage(error)); }
    finally { working.current = false; onBusy(false); }
  }
  const locked = disabled || loading;
  return <View style={styles.card}>
    <Text style={styles.title}>경로 링크 공유</Text>
    <Text style={styles.body}>실제 달린 경로와 출발 당시 계획 코스·원래 도형을 함께 보여줘요. 공유 링크를 가진 사람은 로그인 없이 볼 수 있어요.</Text>
    {!runSharing ? <Text style={styles.body}>링크 공유 서비스를 준비하고 있어요.</Text> : !owner ? <Link href="/account" style={styles.link}>로그인하고 내 기록 공유하기</Link> : <>
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
