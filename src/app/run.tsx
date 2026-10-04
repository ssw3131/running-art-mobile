import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStorage } from '@/modules/storage/database';
import { running } from '@/modules/running/runtime';
import { MAX_GAP_MS, runErrorMessage, statusLabel, type Run, type RunPoint } from '@/modules/running/model';
import RunPath from '@/features/running/RunPath';
import { RunButton, RunStats, styles } from '@/features/running/ui';
import CourseRunPreparation from '@/features/running/CourseRunPreparation';
import LiveGuidancePanel from '@/features/running/LiveGuidancePanel';
import type { GuidanceOptions, RunGuidance } from '@/modules/running/guidance';
import { guidanceNative } from '@/modules/guidance/native';

export default function RunScreen() {
  const params = useLocalSearchParams<{ courseId?: string }>();
  const courseId = typeof params.courseId === 'string' ? params.courseId : undefined;
  const [guide, setGuide] = useState<RunGuidance | null>(null);
  const [run, setRun] = useState<Run | null>(null), [points, setPoints] = useState<RunPoint[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [now, setNow] = useState(0);
  const working = useRef(false), generation = useRef(0), revision = useRef('');
  const supported = Platform.OS === 'android';
  const refresh = useCallback(async () => {
    const request = generation.current;
    const repo = (await getStorage()).runs, active = await repo.active();
    const key = `${active?.id}:${active?.pointCount}`;
    const path = key !== revision.current ? (active ? await repo.points(active.id) : []) : null;
    const guidance = active?.courseId ? await repo.guidance(active.id) : null;
    if (request !== generation.current) return;
    setRun(active); setGuide(guidance); setNow(Date.now()); setReady(true);
    if (path) { setPoints(path); revision.current = key; }
  }, []);
  useFocusEffect(useCallback(() => {
    if (!supported) return;
    const request = ++generation.current;
    let polling = false, ticks = 0;
    const poll = async () => {
      if (polling || working.current || AppState.currentState !== 'active') return;
      polling = true;
      try {
        if (ticks++ % 5 === 0) await running.monitor();
        await refresh();
        if (request === generation.current && running.error()) setError(running.error()!);
      } catch (cause) { if (request === generation.current) setError(runErrorMessage(cause)); }
      finally { polling = false; }
    };
    void poll(); const timer = setInterval(() => void poll(), 1000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') { ticks = 0; void poll(); } });
    return () => { generation.current++; running.cancelPreparation(); clearInterval(timer); subscription.remove(); };
  }, [refresh, supported]));
  async function act(action: () => Promise<unknown>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    const request = generation.current;
    try { await action(); }
    catch (cause) { if (request === generation.current) setError(runErrorMessage(cause)); }
    finally {
      if (request === generation.current) { await refresh().catch(cause => setError(runErrorMessage(cause))); setBusy(false); }
      working.current = false;
    }
  }
  function startOrResume() {
    Alert.alert('화면이 잠겨도 러닝 기록', 'GPS 경로를 이 기기에 저장합니다. 다음 위치 설정에서 정확한 위치와 항상 허용을 선택해 주세요. 러닝 중에는 지속 알림이 표시되며 일시정지·종료하면 위치 수집을 멈춥니다.', [
      { text: '취소', style: 'cancel' }, { text: '계속', onPress: () => void act(() => run ? running.resume(run.id) : running.start(courseId)) },
    ]);
  }
  function finish() {
    if (!run) return;
    const id = run.id;
    Alert.alert(run.courseOutcome === 'arrival-pending' ? '완주 기록을 저장할까요?' : '러닝을 종료할까요?', '현재까지 기록을 저장합니다. 동기화를 켜둔 계정의 기록은 연결되면 서버에도 저장됩니다.', [
      { text: '취소', style: 'cancel' }, { text: '종료·저장', onPress: () => void act(async () => { await running.finish(id); router.replace({ pathname: '/runs/[id]', params: { id } }); }) },
    ]);
  }
  function options(value: GuidanceOptions) {
    if (!run) return;
    void act(async () => { await (await getStorage()).runs.setGuidanceOptions(run.id, value); if (!value.voice) guidanceNative?.silenceLive(); });
  }
  const last = points[points.length - 1];
  return <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>{guide || courseId ? '코스 러닝' : '러닝 기록'}</Text>
    <Text style={styles.body}>GPS로 달린 경로를 이 기기에 저장해요. 인터넷 없이도 기록할 수 있어요.</Text>
    {!supported ? <Text>러닝 추적은 Android 앱에서 사용해 주세요.</Text> : <>
      {busy && <ActivityIndicator />}
      {busy && !run && courseId && <RunButton title="합류 경로 준비 취소" id="run-preparation-cancel" onPress={() => running.cancelPreparation()} />}
      {!!error && <Text testID="run-error" accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!ready && <RunButton title="다시 불러오기" id="run-retry" disabled={busy} onPress={() => void act(async () => { await running.recover(); await refresh(); })} />}
      {run && <>
        {courseId && courseId !== run.courseId && <Text style={styles.body}>이미 진행 중인 러닝이 있어요. 먼저 이 기록을 재개하거나 종료해 주세요.</Text>}
        <Text style={styles.title} testID="run-status">{statusLabel[run.status]}</Text>
        {!!run.reason && <Text style={styles.error}>{run.reason}</Text>}
        <RunStats run={run} now={now} />
        {guide && <LiveGuidancePanel run={run} guide={guide} points={points} now={now} busy={busy} onOptions={options} />}
        {run.status === 'running' && <Text testID="run-signal" style={styles.body}>{!last || now - last.timestamp > MAX_GAP_MS ? 'GPS 신호를 기다리고 있어요. 하늘이 열린 곳으로 이동해 주세요. 공백 구간은 거리에 더하지 않아요.' : `GPS 수신 중 · 마지막 정확도 ±${Math.round(last.accuracy!)}m`}</Text>}
        {!guide && <><RunPath points={points} /><Text style={styles.body}>배경 지도 없이 저장한 궤적을 표시해요. 일시정지·GPS 공백은 선을 끊어 표시합니다.</Text></>}
      </>}
      {ready && !run && courseId && <CourseRunPreparation key={courseId} id={courseId} busy={busy} onStart={startOrResume} />}
      {ready && ((!run && !courseId) || (run && run.status !== 'running')) && <RunButton title={run?.courseOutcome === 'arrival-pending' ? '계속 달리기' : run ? '러닝 재개' : '러닝 시작'} id="run-start" disabled={busy} onPress={startOrResume} />}
      {run?.status === 'running' && <RunButton title="일시정지" id="run-pause" disabled={busy} onPress={() => void act(() => running.pause(run.id))} />}
      {run && <RunButton title={run.courseOutcome === 'arrival-pending' ? '완주 확인·저장' : '러닝 종료·저장'} id="run-finish" disabled={busy} onPress={finish} />}
      <RunButton title="위치 권한 설정" id="run-settings" disabled={busy} onPress={() => void Linking.openSettings().catch(() => setError('앱 설정을 열지 못했어요. 기기 설정에서 위치 권한을 확인해 주세요.'))} />
    </>}
    <Link href="/runs" style={styles.link}>러닝 기록 목록</Link>
  </ScrollView></SafeAreaView>;
}
