import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { datasets, referenceFor, syntheticRoads, type DatasetId } from '@/features/route-lab/fixtures';
import { calculateMobileRoute } from '@/features/route-lab/scheduler';
import { createCenterController, type CenterState } from '@/features/route-lab/center-controller';
import { createLabSession, type LabCalculation } from '@/features/route-lab/session';
import { expoLocationProvider } from '@/modules/location/expo-provider';
import type { RoadMode } from '@/modules/road-data/client';

import { loadMobileRoads } from '@/modules/road-data/mobile-loader';
import { calculateServerRoute } from '@/modules/route-compute/mobile';

import { candidateOverlay } from '@/modules/route-engine/geojson';
import type { Point, ShapeId } from '@/modules/route-engine/types';
import { generationRadiusKm, isGenerationDistance } from '@/modules/route-engine/service-shapes';
import { FIGMA_SHAPE_VERSION } from '@/modules/route-engine/figma-contours';

import { compareReference } from '@/modules/route-engine/verification';
import type { GenerationConditions } from './model';
import { getStorage } from '@/modules/storage/database';
import { authentication } from '@/modules/auth/runtime';
import { parseComputeRequest, type ComputeRequest } from '@/modules/route-compute/contract';

type State = { kind: 'idle' | 'running' | 'cancelled' | 'error' | 'done'; message: string };
type Completed = LabCalculation & { comparison: string; maxTimerLagMs: number; timerTicks: number };

export function locationMessage(state: CenterState) {
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

export function useCourseGeneration() {
  const homeParams = useLocalSearchParams<{ homeShape?: string; homeRequest?: string; homeSection?: string }>();
  const appliedHomeRequest = useRef<string | undefined>(undefined);
  const [datasetId, setDatasetId] = useState<DatasetId>('seoul');
  const [diagnostics, setDiagnostics] = useState(false);
  const [shape, setShape] = useState<ShapeId>('heart');
  const [customTemplate, setCustomTemplate] = useState<Point[] | null>(null);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [targetKm, setTargetKm] = useState(5);
  const [state, setState] = useState<State>({ kind: 'idle', message: '도형과 목표 거리를 고른 뒤 코스를 계산해 보세요.' });
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<'conditions' | 'results'>('conditions');
  const [seconds, setSeconds] = useState(0);
  const [pendingRequest, setPendingRequest] = useState<ComputeRequest | null>(null);
  useEffect(() => {
    if (!completed?.result.candidates.length) return;
    const owner = authentication.getSnapshot().account?.id;
    // Acknowledge only after React committed the displayed candidates.
    void getStorage().then(async db => {
      if (authentication.getSnapshot().account?.id !== owner) return;
      const row = await db.usageJobs.read();
      if (row?.result_json && authentication.getSnapshot().account?.id === owner) await db.usageJobs.clear(row.id);
    }).catch(() => undefined);
  }, [completed]);
  useFocusEffect(useCallback(() => {
    let current = true;
    void getStorage().then(db => db.usageJobs.read()).then(row => {
      if (current) setPendingRequest(row ? parseComputeRequest(JSON.parse(row.request_json)) : null);
    }).catch(() => undefined);
    return () => { current = false; };
  }, []));
  const jobs = useMemo(() => createLabSession(loadMobileRoads, calculateMobileRoute, undefined, calculateServerRoute, true), []);
  const [roadMode, setRoadMode] = useState<RoadMode>('prefer-cache');
  const [deviceOnly, setDeviceOnly] = useState(false);
  const [fixedCenter, setFixedCenter] = useState(false);
  const [validCenter, setValidCenter] = useState(true);
  const [centerState, setCenterState] = useState<CenterState>({ center: datasets.seoul.input.origin, position: null, location: { kind: 'idle' } });
  const center = useMemo(() => createCenterController(expoLocationProvider, datasets.seoul.input.origin, (value) => {
    setCenterState(value);
    if (value.cameraTarget && value.location.kind === 'located') setValidCenter(true);
  }), []);
  const [mapReady, setMapReady] = useState(false);
  const [mapMoving, setMapMoving] = useState(false);
  const returningFromSettings = useRef(false);
  const locatedOnEntry = useRef(false);
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
    if (!homeParams.homeRequest || homeParams.homeRequest === appliedHomeRequest.current) return;
    appliedHomeRequest.current = homeParams.homeRequest;
    if (homeParams.homeSection === 'shapes') { cancel(); setDrawingOpen(false); setTab('conditions'); return; }
    if (homeParams.homeShape !== 'heart' && homeParams.homeShape !== 'fish' && homeParams.homeShape !== 'dog') return;
    cancel(); setShape(homeParams.homeShape); setDrawingOpen(false); setTab('conditions');
    if (completed) setState({ kind: 'done', message: '이전 계산 결과를 표시하고 있어요. 다시 계산하면 새 조건이 적용돼요.' });
  }, [homeParams.homeRequest, homeParams.homeShape, homeParams.homeSection, cancel, completed]));
  useFocusEffect(useCallback(() => {
    // A tab refocus must not replace the user's chosen center with GPS.
    if (datasetId === 'seoul' && !locatedOnEntry.current) {
      locatedOnEntry.current = true;
      void center.locate();
    }
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') cancel('앱이 백그라운드로 이동해 계산을 취소했어요.');
      if (next === 'background') center.beginMove();
      if (next === 'active' && returningFromSettings.current && datasetId === 'seoul') {
        returningFromSettings.current = false;
        void center.locate(false);
      }
    });
    return () => { subscription.remove(); center.beginMove(); setMapMoving(false); cancel('화면을 나가 계산을 취소했어요.'); };
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
  const start = (confirmed?: GenerationConditions, restore?: ComputeRequest) => {
    const requested = confirmed ?? { origin: dataset.synthetic ? dataset.input.origin : center.get().center, shape, targetKm, customTemplate };
    if (!isGenerationDistance(confirmed?.targetKm ?? targetKm)) return;
    if (running.current || drawingOpen || (requested.shape === 'custom' && !requested.customTemplate)) return;
    if (!confirmed && !dataset.synthetic && ((!mapReady && !fixedCenter) || mapMoving || !validCenter || centerState.location.kind === 'loading')) return;
    cancel(); setCompleted(null); setSelected(0); setSeconds(0); setTab('results');
    running.current = true;
    setState({ kind: 'running', message: dataset.synthetic ? '도로 데이터를 준비하고 있어요.' : '지도 중심 주변의 도로를 조회하고 있어요.' });
    // A late GPS response must not replace the center shown in the confirmation.
    const input = restore ? { ...dataset.input, origin: restore.origin, options: restore.options } : { ...dataset.input, origin: { ...requested.origin }, options: { ...dataset.input.options, mode: dataset.synthetic ? 'anchored' as const : 'free-loop' as const, version: '0.2' as const, shape: requested.shape, targetKm: requested.targetKm,
      radiusKm: dataset.synthetic ? dataset.input.options.radiusKm : generationRadiusKm(requested.targetKm),
      ...(!dataset.synthetic ? { shapeVersion: FIGMA_SHAPE_VERSION, maxRouteKm: 20 } : {}),
      ...(requested.shape === 'custom' && requested.customTemplate ? { customTemplate: requested.customTemplate.map(p => ({ ...p })) } : {}) } };
    const expected = dataset.synthetic && requested.shape !== 'custom' ? referenceFor(datasetId, input.options) : null;
    const started = performance.now();
    let lastTick = started, maxTimerLagMs = 0, timerTicks = 0, lastProgress = 0;
    let lastPhase = '';
    timer.current = setInterval(() => {
      const now = performance.now();
      maxTimerLagMs = Math.max(maxTimerLagMs, now - lastTick - 50);
      lastTick = now; timerTicks++;
      if (timerTicks % 5 === 0) setSeconds((now - started) / 1000);
    }, 50);
    void jobs.start({ input, liveRoads: !dataset.synthetic, roadMode: restore ? restore.refresh ? 'refresh' : 'prefer-cache' : roadMode, deviceOnly }, {
      progress: (progress) => {
        const now = performance.now();
        if (progress.phase !== lastPhase || now - lastProgress >= 120) {
          setState({ kind: 'running', message: progress.text });
          lastProgress = now; lastPhase = progress.phase;
        }
      },
      success: (value) => {
        setPendingRequest(null);
        stopTimer(); running.current = false;
        const mismatch = expected ? compareReference(value.result, expected) : null;
        const comparison = expected ? mismatch ? `원본과 차이 있음: ${mismatch}` : '원본과 일치 (허용 오차 0.000001)' : dataset.synthetic ? '이 입력은 저장된 원본 비교 사례에 없어요.' : '선택한 지도 중심 기준 결과예요. 고정 표본의 원본 비교는 적용하지 않아요.';
        setCompleted({ ...value, result: { ...value.result, candidates: [...value.result.candidates].sort((a, b) => b.score.raw - a.score.raw) }, comparison, maxTimerLagMs, timerTicks });
        setSeconds(value.timing.totalMs / 1000);
        const where = value.execution === 'server' ? '서버에서' : value.fallback ? '서버 연결 대신 기기에서' : '기기에서';
        setState({ kind: 'done', message: value.result.candidates.length ? `${where} ${value.result.candidates.length}개 코스를 찾았어요.` : '조건에 맞는 코스가 없어요. 도형이나 거리를 바꿔 보세요.' });
        console.info('ROUTE_LAB_METRICS', JSON.stringify({ dataset: datasetId, shape: input.options.shape, targetKm: input.options.targetKm, ...value.metrics, timing: value.timing, cached: value.cached, roadCache: value.roadCache, maxTimerLagMs, timerTicks, reference: expected ? mismatch ?? 'match' : 'unavailable', candidates: value.result.candidates.length, scores: value.result.candidates.map((c) => c.score.raw) }));
      },
      error: (error) => { stopTimer(); running.current = false; setState({ kind: 'error', message: error.message });
        void getStorage().then(db=>db.usageJobs.read()).then(row=>setPendingRequest(row?parseComputeRequest(JSON.parse(row.request_json)):null)).catch(()=>undefined);
      },
    });
  };

  const locate = () => {
    setFixedCenter(false);
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
  const cannotCalculate = !isGenerationDistance(targetKm) || (shape === 'custom' && !customTemplate) || (!dataset.synthetic && ((!mapReady && !fixedCenter) || mapMoving || !validCenter || centerState.location.kind === 'loading'));

  const restore = () => {
    if (!pendingRequest) return;
    const request = pendingRequest;
    start({ origin: request.origin, shape: request.options.shape, targetKm: request.options.targetKm, customTemplate: request.options.customTemplate }, request);
  };
  return { pendingRequest, restore, tab, setTab, datasetId, setDatasetId, dataset, diagnostics, setDiagnostics, shape, setShape, customTemplate, setCustomTemplate, drawingOpen, setDrawingOpen, targetKm, setTargetKm, state, completed, selected, setSelected, seconds, roadMode, setRoadMode, deviceOnly, setDeviceOnly, fixedCenter, setFixedCenter, validCenter, setValidCenter, centerState, center, mapReady, setMapReady, mapMoving, setMapMoving, roads, overlay, cancel, reset, changeSearch, start, locate, cannotCalculate };
}
