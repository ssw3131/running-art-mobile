import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ServiceTabLink } from '@/features/service/ServiceTabLink';
import { useCallback, useRef, useState } from 'react';
import { Alert, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { openServiceTab } from '@/features/service/open-service-tab';
import { prepareRunRetry } from '@/modules/running/retry';
import { runOutcomeLabel } from '@/modules/running/archive';
import { getStorage } from '@/modules/storage/database';
import { RunError, runErrorMessage, type Run, type RunPoint } from '@/modules/running/model';
import RunPath from '@/features/running/RunPath';
import RunSharePanel from '@/features/running/RunSharePanel';
import { RunButton, RunStats, styles } from '@/features/running/ui';

export default function RunDetailScreen() {
  const auth=useAuth(),owner=auth.ready?auth.account?.id??'':null;
  const [loadedOwner,setLoadedOwner]=useState<string|null>(null);
  const params = useLocalSearchParams<{ id: string }>(); const id = typeof params.id === 'string' ? params.id : '';
  const [run, setRun] = useState<Run | null>(null), [points, setPoints] = useState<RunPoint[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const generation = useRef(0), working = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current; setError(''); setRun(null);
    try {
      const repo = (await getStorage()).runs; if(request!==generation.current)return;
      const record = await repo.get(id), path = await repo.points(id);
      if (generation.current === request) { setRun(record); setPoints(path); setLoadedOwner(owner); }
    } catch (cause) { if (generation.current === request) setError(runErrorMessage(cause)); }
  }, [id,owner]);
  useFocusEffect(useCallback(() => { if (Platform.OS === 'android' && owner!==null) void refresh(); return () => { generation.current++; }; }, [refresh,owner]));
  async function remove() {
    if (working.current) return;
    const request = generation.current; working.current = true; setBusy(true); setError('');
    try { const db=await getStorage(); if(request!==generation.current)return; await db.runs.remove(id); if (request === generation.current) router.replace('/runs'); }
    catch (cause) { if (request === generation.current) setError(runErrorMessage(cause)); }
    finally { working.current = false; if (request === generation.current) setBusy(false); }
  }
  async function retry() {
    if(working.current || loadedOwner!==owner)return;
    const request=generation.current;working.current=true;setBusy(true);setError('');
    const assertCurrent=()=>{if(request!==generation.current)throw new RunError('계정이나 화면이 변경됐어요. 다시 시도해 주세요.');};
    try {const db=await getStorage();assertCurrent();const saved=await prepareRunRetry(db,id,assertCurrent);assertCurrent();openServiceTab({pathname:'/run',params:{courseId:saved.id}});}
    catch(cause){if(request===generation.current)setError(runErrorMessage(cause));}
    finally{working.current=false;if(request===generation.current)setBusy(false);}
  }
  return <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}>
    {!!error && <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><RunButton id="run-detail-retry" title="다시 불러오기" disabled={busy} onPress={() => void refresh()} /></>}
    {run && loadedOwner===owner && <>
      <Text style={styles.body}>{new Date(run.startedAt).toLocaleString('ko-KR')} · {runOutcomeLabel(run)}</Text>
      {run.courseId && <Text testID="run-course-result" style={styles.title}>{run.courseName} · {runOutcomeLabel(run)}</Text>}
      <RunPath points={points} />
      <RunStats run={run} now={run.checkpointAt} />
      {!!run.reason && <Text style={styles.body}>{run.reason}</Text>}
      <Text style={styles.body}>저장된 GPS 궤적입니다. 일시정지·GPS 공백은 연결하지 않아요. 활동 시간에는 일시정지를 제외하고 GPS를 기다린 시간이 포함됩니다.</Text>
      {run.status === 'completed' && run.courseId && <><RunButton id="run-rechallenge" title="이 코스 저장·재도전" disabled={busy} onPress={()=>void retry()}/><Text style={styles.body}>러닝 당시 코스 사본을 보관함에 저장하고 새 도전을 준비해요. 이전 기록의 거리와 완주 여부는 바뀌지 않아요.</Text></>}
      {run.status === 'completed' && <RunSharePanel id={run.id} disabled={busy} onBusy={setBusy} />}
      {run.status !== 'completed' ? <ServiceTabLink href="/run" style={styles.link}>진행 중인 러닝으로 이동</ServiceTabLink> :
        <RunButton id="run-delete" title="기록 삭제" disabled={busy} onPress={() => Alert.alert('이 러닝 기록을 삭제할까요?', '저장된 GPS 좌표와 요약이 함께 삭제됩니다. 계정에 연결한 기록은 다음 동기화 때 서버와 다른 기기에서도 삭제되며 공유 링크도 중단됩니다. 즉시 공개를 멈추려면 먼저 공유 중단을 눌러 주세요.', [
          { text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void remove() },
        ])} />}
    </>}
    <Link href="/runs" style={styles.link}>러닝 기록 목록</Link>
  </ScrollView></SafeAreaView>;
}
