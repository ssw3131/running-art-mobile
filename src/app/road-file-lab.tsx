import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { runRoadFileBenchmark } from '@/features/road-file-lab/benchmark';
import { mobileScheduler } from '@/features/route-lab/scheduler';

export default function RoadFileLabScreen() {
  const params = useLocalSearchParams<{ grid?: string; autostart?: string }>();
  const [step, setStep] = useState(Number(params.grid ?? 200000));
  const [status, setStatus] = useState('PC에서 로컬 표본 서버를 실행하고 USB 연결을 준비하세요.');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  async function start(grid = step) {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setSummary('');
    try {
      const result = await runRoadFileBenchmark({ signal: current.signal, gridStepE7: grid,
        progress: text => { if (mounted.current) setStatus(text); }, yieldToHost: mobileScheduler.yieldToHost });
      if (!mounted.current || current.signal.aborted) return;
      console.info(`ROAD_FILE_LAB_COMPLETE ${JSON.stringify({ recordedAt: result.recordedAt, gridStepE7: grid, runs: result.records.length })}`);
      setStatus('9회 입력·그래프 검증 완료');
      setSummary(result.records.map(r => `${r.sample} #${r.run}: ${r.totalMs.toFixed(0)}ms (해제 ${r.gunzipMs.toFixed(0)}ms, 병합 ${r.mergeMs.toFixed(0)}ms, 그래프 ${r.graphMs.toFixed(0)}ms)`).join('\n'));
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error ? error.message : '표본 검증에 실패했어요.');
    } finally {
      controller.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  // Explicit test deep link only. Normal app route calculation does not invoke this lab.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (params.autostart === '1' && !autoStarted.current) { autoStarted.current = true; void start(Number(params.grid ?? 200000)); }
    // Run only for the initial explicit deep-link request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.autostart, params.grid]);
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>도로 파일 로컬 검증</Text>
    <Text>서울·부산·경계 표본을 각 3회 읽고 PC와 동일한 엔진 입력인지 확인합니다. 사용자 현재 위치는 사용하지 않습니다.</Text>
    <View style={styles.row}>{[100000, 200000, 400000].map(value => <Pressable key={value} disabled={busy}
      accessibilityRole="button" onPress={() => setStep(value)} style={[styles.option, step === value && styles.selected]}>
      <Text>{(value / 1e7).toFixed(2)}도</Text>
    </Pressable>)}</View>
    <Pressable disabled={busy} accessibilityRole="button" onPress={() => void start()} style={styles.button}><Text style={styles.buttonText}>표본 검증 시작</Text></Pressable>
    {busy && <Pressable accessibilityRole="button" onPress={() => controller.current?.abort()} style={styles.option}><Text>취소</Text></Pressable>}
    <Text testID="road-file-lab-status" selectable>{status}</Text>
    <Text selectable style={styles.results}>{summary}</Text>
    <Text>PC 로컬 전송 측정입니다. 운영 다운로드 속도·영구 캐시·전체 코스 계산 성능과는 별도입니다. 메모리는 PC의 adb 수집 기록으로 확인합니다.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: 24, gap: 18, backgroundColor: '#F6F5F0' },
  title: { fontSize: 24, fontWeight: '700', color: '#183C32' }, row: { flexDirection: 'row', gap: 12 },
  option: { padding: 14, borderWidth: 1, borderColor: '#7B8B80', borderRadius: 10 }, selected: { backgroundColor: '#CFE3D1' },
  button: { padding: 18, backgroundColor: '#183C32', borderRadius: 12 }, buttonText: { color: 'white', textAlign: 'center' },
  results: { fontSize: 12, lineHeight: 20 } });
