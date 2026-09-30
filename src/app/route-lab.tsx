import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { datasets, referenceFor, syntheticRoads, type DatasetId } from '@/features/route-lab/fixtures';
import { calculateMobileRoute } from '@/features/route-lab/scheduler';
import { createCenterController, type CenterState } from '@/features/route-lab/center-controller';
import { createLabSession, type LabCalculation } from '@/features/route-lab/session';
import { expoLocationProvider } from '@/modules/location/expo-provider';
import { createRoadLoader } from '@/modules/road-data/client';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import { SHAPES } from '@/modules/route-engine/engine';
import { candidateOverlay } from '@/modules/route-engine/geojson';
import type { ShapeId } from '@/modules/route-engine/types';
import { compareReference } from '@/modules/route-engine/verification';
import SaveCoursePanel from '@/features/courses/SaveCoursePanel';

const styleUrl = mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY);
const loadRoads = createRoadLoader({ endpoint: process.env.EXPO_PUBLIC_ROAD_DATA_URL,
  onAttempt: (event) => console.info('ROAD_DATA_ATTEMPT', JSON.stringify(event)),
});
type State = { kind: 'idle' | 'running' | 'cancelled' | 'error' | 'done'; message: string };
type Completed = LabCalculation & { comparison: string; maxTimerLagMs: number; timerTicks: number };
const time = (ms: number) => `${(ms / 1000).toFixed(2)}초`;

function locationMessage(state: CenterState) {
  switch (state.location.kind) {
    case 'loading': return '현재 위치를 확인하고 있어요. 지도를 움직여 직접 선택할 수도 있어요.';
    case 'located': return `내 위치 확인 완료${state.position?.accuracy != null ? ` · 정확도 약 ${Math.round(state.position.accuracy)}m` : ''}. 계산은 지도 중심을 사용해요.`;
    case 'denied': return '위치 권한이 없어 지도로 직접 중심을 선택해 주세요. 내 위치 버튼으로 다시 확인할 수 있어요.';
    case 'services-disabled': return '기기의 위치 기능이 꺼져 있어요. 위치 설정을 켜거나 지도로 직접 선택해 주세요.';
    case 'timeout': return '현재 위치를 찾지 못했어요. 내 위치를 다시 누르거나 지도로 중심을 선택해 주세요.';
    case 'unavailable': return '현재 위치를 확인하지 못했어요. 지도로 중심을 선택할 수 있어요.';
    default: return '가운데 십자 표시가 계산 중심이에요. 지도를 움직여 원하는 위치를 선택하세요.';
  }
}

export default function RouteLabScreen() {
  const [datasetId, setDatasetId] = useState<DatasetId>('grid');
  const [shape, setShape] = useState<ShapeId>('heart');
  const [targetKm, setTargetKm] = useState(5);
  const [state, setState] = useState<State>({ kind: 'idle', message: '도형과 목표 거리를 고른 뒤 코스를 계산해 보세요.' });
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [selected, setSelected] = useState(0);
  const [taps, setTaps] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const jobs = useMemo(() => createLabSession(loadRoads, calculateMobileRoute), []);
  const [validCenter, setValidCenter] = useState(true);
  const [centerState, setCenterState] = useState<CenterState>({ center: datasets.seoul.input.origin, position: null, location: { kind: 'idle' } });
  const center = useMemo(() => createCenterController(expoLocationProvider, datasets.seoul.input.origin, (value) => {
    setCenterState(value);
    if (value.cameraTarget && value.location.kind === 'located') setValidCenter(true);
  }), []);
  const [mapReady, setMapReady] = useState(false);
  const [mapMoving, setMapMoving] = useState(false);
  const returningFromSettings = useRef(false);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataset = datasets[datasetId];
  const roads = useMemo(() => dataset.synthetic ? syntheticRoads(dataset.input) : undefined, [dataset]);
  const overlay = useMemo(() => {
    const candidate = completed?.result.candidates[selected];
    return candidate && completed ? candidateOverlay(candidate, completed.origin) : null;
  }, [completed, selected]);

  const stopTimer = useCallback(() => { if (timer.current !== null) clearInterval(timer.current); timer.current = null; }, []);
  const cancel = useCallback((message = '계산을 취소했어요. 다시 시작할 수 있어요.') => {
    jobs.cancel();
    stopTimer();
    if (running.current) setState({ kind: 'cancelled', message });
    running.current = false;
  }, [jobs, stopTimer]);
  useFocusEffect(useCallback(() => {
    if (datasetId === 'seoul') void center.locate();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') cancel('앱이 백그라운드로 이동해 계산을 취소했어요.');
      if (next === 'background') center.beginMove();
      if (next === 'active' && returningFromSettings.current && datasetId === 'seoul') {
        returningFromSettings.current = false;
        void center.locate(false);
      }
    });
    return () => { subscription.remove(); center.cancel(); cancel('화면을 나가 계산을 취소했어요.'); };
  }, [cancel, center, datasetId]));

  const reset = () => {
    cancel(); setCompleted(null); setSelected(0); setSeconds(0);
    setState({ kind: 'idle', message: '선택한 조건으로 코스를 계산해 보세요.' });
  };
  // Editing the next search must not erase the last completed route or its origin.
  const changeSearch = () => {
    cancel();
    if (completed) setState({ kind: 'done', message: '이전 계산 결과를 표시하고 있어요. 다시 계산하면 새 조건이 적용돼요.' });
  };
  const start = () => {
    if (!dataset.synthetic && (!mapReady || mapMoving || !validCenter || centerState.location.kind === 'loading')) return;
    cancel(); setCompleted(null); setSelected(0); setTaps(0); setSeconds(0);
    running.current = true;
    setState({ kind: 'running', message: dataset.synthetic ? '도로 데이터를 준비하고 있어요.' : '지도 중심 주변의 도로를 조회하고 있어요.' });
    const input = { ...dataset.input, origin: dataset.synthetic ? dataset.input.origin : center.get().center, options: { ...dataset.input.options, version: '0.2' as const, shape, targetKm } };
    const expected = dataset.synthetic ? referenceFor(datasetId, input.options) : null;
    const started = performance.now();
    let lastTick = started, maxTimerLagMs = 0, timerTicks = 0, lastProgress = 0;
    let lastPhase = '';
    timer.current = setInterval(() => {
      const now = performance.now();
      maxTimerLagMs = Math.max(maxTimerLagMs, now - lastTick - 50);
      lastTick = now; timerTicks++;
      if (timerTicks % 5 === 0) setSeconds((now - started) / 1000);
    }, 50);
    void jobs.start({ input, liveRoads: !dataset.synthetic }, {
      progress: (progress) => {
        const now = performance.now();
        if (progress.phase !== lastPhase || now - lastProgress >= 120) {
          setState({ kind: 'running', message: progress.text });
          lastProgress = now; lastPhase = progress.phase;
        }
      },
      success: (value) => {
        stopTimer(); running.current = false;
        const mismatch = expected ? compareReference(value.result, expected) : null;
        const comparison = expected ? mismatch ? `원본과 차이 있음: ${mismatch}` : '원본과 일치 (허용 오차 0.000001)' : dataset.synthetic ? '이 입력은 저장된 원본 비교 사례에 없어요.' : '선택한 지도 중심 기준 결과예요. 고정 표본의 원본 비교는 적용하지 않아요.';
        setCompleted({ ...value, comparison, maxTimerLagMs, timerTicks });
        setSeconds(value.timing.totalMs / 1000);
        setState({ kind: 'done', message: value.result.candidates.length ? `${value.result.candidates.length}개 코스를 찾았어요.` : '조건에 맞는 코스가 없어요. 도형이나 거리를 바꿔 보세요.' });
        console.info('ROUTE_LAB_METRICS', JSON.stringify({ dataset: datasetId, shape, targetKm, ...value.metrics, timing: value.timing, cached: value.cached, maxTimerLagMs, timerTicks, reference: expected ? mismatch ?? 'match' : 'unavailable', candidates: value.result.candidates.length, scores: value.result.candidates.map((c) => c.score.raw) }));
      },
      error: (error) => { stopTimer(); running.current = false; setState({ kind: 'error', message: error.message }); },
    });
  };

  const locate = () => {
    changeSearch();
    const location = centerState.location;
    if (location.kind === 'denied' && !location.canAskAgain) {
      returningFromSettings.current = true;
      void Linking.openSettings().catch(() => setState({ kind: 'error', message: '기기 설정에서 앱 위치 권한을 허용해 주세요.' }));
    } else if (location.kind === 'services-disabled' && Platform.OS === 'android') {
      returningFromSettings.current = true;
      void Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => setState({ kind: 'error', message: '기기 설정에서 위치 기능을 켜 주세요.' }));
    } else void center.locate();
  };
  const cannotCalculate = !dataset.synthetic && (!mapReady || mapMoving || !validCenter || centerState.location.kind === 'loading');

  return <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
    <View style={styles.map}>
      {dataset.synthetic || styleUrl ? <MapSurface key={datasetId} styleUrl={styleUrl ?? ''} position={dataset.synthetic ? null : centerState.position} origin={dataset.synthetic ? dataset.input.origin : centerState.center} syntheticRoads={roads} routeOverlay={overlay} centerSelection={dataset.synthetic ? undefined : {
        target: centerState.cameraTarget,
        onMoveStart: () => { changeSearch(); center.beginMove(); setMapMoving(true); },
        onMoveEnd: (origin) => { setValidCenter(!!origin); if (origin) center.move(origin); setMapMoving(false); },
        onReady: setMapReady,
      }} /> : <View style={styles.placeholder}><Text>지도를 연결하면 화면 중심으로 코스를 계산할 수 있어요.</Text></View>}
      <View pointerEvents="none" style={styles.mapLabel}><Text style={styles.mapLabelText}>{dataset.synthetic ? '가상 도로 · 실제 길 아님' : '지도 중심 기준 · 주변 2km'}</Text></View>
      {!dataset.synthetic && <View pointerEvents="none" style={styles.crosshair}><View style={styles.crosshairHorizontal} /><View style={styles.crosshairVertical} /><View style={styles.crosshairDot} /></View>}
    </View>
    <View style={styles.legend}><Text style={styles.small}>초록 실선: 추천 코스 · 갈색 점선: 목표 도형 · 점: 출발/도착</Text></View>
    {!dataset.synthetic && <View style={styles.credits}>
      <Image source={require('@/assets/images/maptiler-logo.png')} style={styles.logo} resizeMode="contain" />
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.maptiler.com/copyright/').catch(() => {})}><Text style={styles.small}>© MapTiler</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}><Text style={styles.small}>© OpenStreetMap contributors · ODbL</Text></Pressable>
    </View>}
    {!dataset.synthetic && <View style={styles.centerBar}>
      <Text testID="selected-center" style={styles.small}>{mapMoving ? '지도 이동 중… 손을 놓으면 중심이 선택돼요.' : !validCenter ? '지원 범위 밖이에요. 지도를 이동해 주세요.' : `계산 중심 ${centerState.center.lat.toFixed(5)}, ${centerState.center.lng.toFixed(5)}`}</Text>
      <Pressable testID="route-locate" accessibilityRole="button" disabled={centerState.location.kind === 'loading'} onPress={locate} style={styles.locate}><Text style={styles.chipText}>{centerState.location.kind === 'loading' ? '위치 확인 중…' : '내 위치'}</Text></Pressable>
    </View>}
    <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
      <Text style={styles.title}>코스 계산 테스트</Text>
      <View style={styles.row}>{(Object.keys(datasets) as DatasetId[]).map((id) => <Pressable key={id} testID={`dataset-${id}`} accessibilityRole="button" accessibilityState={{ selected: datasetId === id }} style={[styles.chip, datasetId === id && styles.chipSelected]} onPress={() => { reset(); if (id !== datasetId) { setMapReady(false); setMapMoving(false); } setDatasetId(id); setTargetKm(datasets[id].input.options.targetKm); }}><Text style={datasetId === id ? styles.chipTextSelected : styles.chipText}>{datasets[id].name}</Text></Pressable>)}</View>
      <Text style={styles.description}>{dataset.description}</Text>
      {!dataset.synthetic && <Text testID={`route-location-${centerState.location.kind}`} style={styles.small}>{locationMessage(centerState)}</Text>}
      <Text style={styles.label}>도형</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{SHAPES.map((item) => <Pressable key={item.id} testID={`shape-${item.id}`} accessibilityRole="button" accessibilityState={{ selected: shape === item.id }} style={[styles.chip, shape === item.id && styles.chipSelected]} onPress={() => { changeSearch(); setShape(item.id as ShapeId); }}><Text style={shape === item.id ? styles.chipTextSelected : styles.chipText}>{item.name}</Text></Pressable>)}</ScrollView>
      <View style={styles.row}><Text style={styles.label}>목표 거리</Text>{[3, 5, 7].map((km) => <Pressable key={km} testID={`distance-${km}`} accessibilityRole="button" accessibilityState={{ selected: targetKm === km }} style={[styles.chip, targetKm === km && styles.chipSelected]} onPress={() => { changeSearch(); setTargetKm(km); }}><Text style={targetKm === km ? styles.chipTextSelected : styles.chipText}>{km} km</Text></Pressable>)}</View>
      <View style={styles.row}>
        <Pressable testID="calculate-route" accessibilityRole="button" accessibilityState={{ disabled: cannotCalculate }} disabled={cannotCalculate} onPress={start} style={[styles.primary, cannotCalculate && styles.disabled]}><Text style={styles.primaryText}>{mapMoving ? '지도 중심 선택 중' : state.kind === 'running' ? '처음부터 다시 계산' : '코스 계산하기'}</Text></Pressable>
        {state.kind === 'running' && <Pressable testID="cancel-route" accessibilityRole="button" onPress={() => cancel()} style={styles.cancel}><Text style={styles.chipText}>취소</Text></Pressable>}
      </View>
      <View testID={`calculation-${state.kind}`} accessibilityLiveRegion="polite" style={styles.status}>
        {state.kind === 'running' && <ActivityIndicator color="#23694C" />}
        <Text style={styles.statusText}>{state.message}</Text>
        {seconds > 0 && !completed && <Text style={styles.small}>{seconds.toFixed(1)}초</Text>}
      </View>
      {completed && <View testID="route-timing" style={styles.timing}>
        <Text style={styles.candidateTitle}>전체 소요 시간 {time(completed.timing.totalMs)}</Text>
        <Text style={styles.description}>도로 조회 {time(completed.timing.roadMs)}{dataset.synthetic ? ' · 저장 표본' : completed.cached ? ' · 캐시 사용' : ' · 다운로드'}{'\n'}코스 계산 {time(completed.timing.calculationMs)}</Text>
        {!dataset.synthetic && <Text testID="result-center" style={styles.small}>계산 기준 {completed.origin.lat.toFixed(5)}, {completed.origin.lng.toFixed(5)}</Text>}
        <Text style={styles.small}>{completed.source}</Text>
      </View>}
      <Pressable testID="response-check" accessibilityRole="button" onPress={() => setTaps((value) => value + 1)} style={styles.response}><Text style={styles.small}>화면 반응 확인 · 누른 횟수 {taps}</Text></Pressable>
      {completed && <>
        <Text testID="reference-comparison" style={styles.description}>{completed.comparison}</Text>
        <Text testID="calculation-metrics" style={styles.small}>노드 {completed.metrics.nodes} · 도로 구간 {completed.metrics.edges}{'\n'}최대 연속 계산 {completed.metrics.maxSliceMs.toFixed(1)}ms · 타이머 최대 지연 {completed.maxTimerLagMs.toFixed(1)}ms</Text>
        {completed.result.candidates.map((candidate, index) => <Pressable key={index} testID={`candidate-${index}`} accessibilityRole="button" accessibilityState={{ selected: selected === index }} onPress={() => setSelected(index)} style={[styles.candidate, selected === index && styles.candidateSelected]}>
          <Text style={styles.candidateTitle}>{index + 1}순위 · {candidate.score.lengthKm.toFixed(2)} km · {candidate.score.total}점</Text>
          <Text style={styles.small}>도형 크기 {(candidate.scaleRatio * 100).toFixed(0)}% · 접근/복귀 {candidate.accessKm.toFixed(2)} km</Text>
        </Pressable>)}
        <Text style={styles.small}>점수는 후보 비교용이며 정확한 일치율이 아니에요. 출발점은 입력 좌표에서 {completed.result.snapMeters.toFixed(1)}m 떨어진 도로 위 점이에요.</Text>
        {completed.result.candidates.length > 0 && <SaveCoursePanel completed={completed} selected={selected} />}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F5F0' },
  map: { height: '32%', minHeight: 185 }, placeholder: { flex: 1, padding: 24, justifyContent: 'center' },
  mapLabel: { position: 'absolute', top: 10, left: 12, backgroundColor: '#FFFFFFEE', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  mapLabelText: { color: '#183C32', fontSize: 12, fontWeight: '600' },
  crosshair: { position: 'absolute', top: '50%', left: '50%', width: 28, height: 28, marginTop: -14, marginLeft: -14, alignItems: 'center', justifyContent: 'center' },
  crosshairHorizontal: { position: 'absolute', width: 28, height: 3, backgroundColor: '#183C32', borderWidth: 0.5, borderColor: '#FFFFFF' },
  crosshairVertical: { position: 'absolute', width: 3, height: 28, backgroundColor: '#183C32', borderWidth: 0.5, borderColor: '#FFFFFF' },
  crosshairDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#183C32' },
  centerBar: { paddingHorizontal: 14, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  locate: { padding: 10, borderRadius: 10, backgroundColor: '#E8EDE7' }, disabled: { opacity: 0.5 },
  timing: { padding: 14, borderRadius: 12, backgroundColor: '#EDF5EC', gap: 6 },
  legend: { paddingHorizontal: 14, paddingVertical: 6 }, credits: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 4 },
  logo: { width: 60, height: 16 }, panel: { flex: 1 }, content: { padding: 18, gap: 12, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '700', color: '#183C32' }, label: { color: '#183C32', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: 20, backgroundColor: '#E8EDE7' },
  chipSelected: { backgroundColor: '#183C32' }, chipText: { color: '#183C32', fontWeight: '600' }, chipTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  description: { color: '#57675F', fontSize: 14, lineHeight: 21 }, small: { color: '#57675F', fontSize: 12, lineHeight: 18 },
  primary: { flex: 1, backgroundColor: '#183C32', borderRadius: 12, padding: 15, alignItems: 'center' }, primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  cancel: { padding: 15, borderRadius: 12, backgroundColor: '#E8EDE7' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 }, statusText: { flex: 1, color: '#183C32', fontSize: 14, lineHeight: 21 },
  response: { alignSelf: 'flex-start', borderColor: '#CFD9CF', borderWidth: 1, borderRadius: 8, padding: 8 },
  candidate: { padding: 14, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E1E7DF', gap: 5 },
  candidateSelected: { borderColor: '#23694C', backgroundColor: '#EDF5EC' }, candidateTitle: { color: '#183C32', fontSize: 16, fontWeight: '600' },
});
