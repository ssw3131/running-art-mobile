import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppModal, AppText, Button, Tabs, Toggle } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import DrawingEditor, { DrawingPreview } from '@/features/route-lab/DrawingEditor';
import { datasets, type DatasetId } from '@/features/route-lab/fixtures';
import { courseFromCalculation } from '@/features/route-lab/saved-course';
import { courseShapes } from '@/modules/courses/model';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import { roadLocations } from '@/modules/road-data/supply-config';
import { SERVICE_SHAPES, GENERATION_DISTANCES } from '@/modules/route-engine/service-shapes';
import type { ShapeId } from '@/modules/route-engine/types';
import { useThemeColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { candidateDrafts, centerLabel, sameConditions, type GenerationConditions } from './model';
import { GenerationIcon } from './GenerationIcon';
import { MapCredits } from './MapCredits';
import ImageShapeEditor from './ImageShapeEditor';
import { locationMessage, useCourseGeneration } from './use-course-generation';

const styleUrl = mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY);
const routeColors = { route: '#FF5264', target: '#5197FE' };
const modes = [{ id: 'prefer-cache', label: '저장 자료 우선' }, { id: 'refresh', label: '새 버전 확인' }, { id: 'offline', label: '오프라인' }] as const;

export default function CourseGenerationScreen() {
  const g = useCourseGeneration(), c = useThemeColors(), auth = useAuth();
  const { width, fontScale } = useWindowDimensions();
  const shapeColumns = fontScale >= 1.4 ? 2 : width < 390 ? 3 : 4;
  const shapeWidth = (width - 48 - 10 * (shapeColumns - 1)) / shapeColumns;
  const scroll = useRef<ScrollView>(null), generateButton = useRef<View>(null);
  const [confirmation, setConfirmation] = useState<GenerationConditions | null>(null);
  const [showTarget, setShowTarget] = useState(true), [optionsOpen, setOptionsOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const current: GenerationConditions = { origin: g.dataset.synthetic ? g.dataset.input.origin : g.centerState.center,
    shape: g.shape, targetKm: g.targetKm, customTemplate: g.customTemplate };
  const resultConditions = g.completed && { origin: g.completed.origin, ...g.completed.options };
  const changed = !!resultConditions && !sameConditions(current, resultConditions);
  const choosing = g.tab === 'conditions';
  const busy = g.state.kind === 'running';
  const result = g.completed;
  useFocusEffect(useCallback(() => () => { setConfirmation(null); setImageOpen(false); }, []));
  const [draftOwner,setDraftOwner]=useState(auth.account?.id);
  if(draftOwner!==auth.account?.id){
    setDraftOwner(auth.account?.id);setConfirmation(null);setImageOpen(false);
  }
  const chooseTab = (tab: 'conditions' | 'results') => { g.setTab(tab); };
  useEffect(() => {
    // Wait for the new form to reach the native scroll view before resetting it.
    const frame=requestAnimationFrame(()=>scroll.current?.scrollTo({y:0,animated:false}));
    return ()=>cancelAnimationFrame(frame);
  },[g.tab]);
  const showConfirmation = () => {
    if (g.cannotCalculate || busy) return;
    setNotice('');
    setConfirmation({ ...current, origin: { ...current.origin }, customTemplate: current.customTemplate?.map(p => ({ ...p })) });
  };
  const confirm = () => {
    const agreed = confirmation;
    setConfirmation(null);
    if (!agreed || !sameConditions(agreed, current) || g.cannotCalculate) {
      setNotice('조건이 바뀌었어요. 현재 조건을 다시 확인해 주세요.'); return;
    }
    g.start(agreed); scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const detail = () => {
    if (!result) return;
    try {
      const draft = candidateDrafts.put(courseFromCalculation(result, g.selected), g.selected + 1, auth.account?.id ?? 'guest');
      router.push({ pathname: '/course-candidate', params: { draft } });
    } catch { setNotice('선택한 코스를 열지 못했어요. 다시 생성해 주세요.'); }
  };
  const selection = {
    target: g.centerState.cameraTarget,
    onMoveStart: () => { g.changeSearch(); g.setFixedCenter(false); g.center.beginMove(); g.setMapMoving(true); },
    onMoveEnd: (origin: { lat: number; lng: number } | null) => { g.setValidCenter(!!origin); if (origin) g.center.move(origin); g.setMapMoving(false); },
    onReady: g.setMapReady,
  };
  const map = <View style={[styles.map, { backgroundColor: c.navigation, borderRadius: choosing ? radius.card : 0 }]}>
    <MapSurface key={g.datasetId} styleUrl={styleUrl ?? ''} position={choosing && !g.dataset.synthetic ? g.centerState.position : null}
      origin={choosing ? current.origin : result?.origin ?? current.origin} syntheticRoads={g.roads}
      routeOverlay={choosing ? null : g.overlay} showTarget={showTarget} routeColors={routeColors}
      centerSelection={choosing && !g.dataset.synthetic ? selection : undefined} />
    {choosing && !g.dataset.synthetic && <View pointerEvents="none" style={styles.crosshair}>
      <View style={[styles.crossLine, { width: 26, height: 2 }]} /><View style={[styles.crossLine, { width: 2, height: 26 }]} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.selected, borderWidth: 2, borderColor: c.surface }} />
    </View>}
    {g.dataset.synthetic && <View style={styles.mapNote}><AppText variant="caption">가상 도로 · 실제 길 아님</AppText></View>}
  </View>;
  const status = <View testID={`calculation-${g.state.kind}`} accessibilityLiveRegion="polite" style={[styles.status, { backgroundColor: c.navigation }]}>
    {busy && <ActivityIndicator color={c.action} />}
    <AppText variant="label" style={{ flexShrink: 1 }}>{g.state.message}</AppText>
    {busy && <><AppText variant="caption">{g.seconds.toFixed(1)}초</AppText><Button compact variant="outline" label="취소" testID="cancel-route" onPress={() => g.cancel()} /></>}
  </View>;
  return <View style={[styles.screen, { backgroundColor: c.background }]} testID="course-generation">
    {imageOpen && <ImageShapeEditor onCancel={() => setImageOpen(false)} onApply={points => { g.changeSearch(); g.setCustomTemplate(points); g.setShape('custom'); setImageOpen(false); }} />}
    <Tabs options={[{ value: 'conditions', label: '조건 설정' }, { value: 'results', label: '추천 코스' }]}
      value={g.tab} onChange={value => chooseTab(value as 'conditions' | 'results')} />
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {!!notice && <AppText accessibilityRole="alert">{notice}</AppText>}
      {choosing ? <>
        {changed && <AppText testID="generation-changed" variant="label">이전 계산 결과를 보관하고 있어요. 다시 생성하면 새 조건이 적용돼요.</AppText>}
        <View style={styles.headingRow}><AppText variant="heading" weight="bold">1. 탐색 위치</AppText>
          <Pressable testID="route-locate" accessibilityRole="button" accessibilityLabel="현재 위치" disabled={g.centerState.location.kind === 'loading'}
            onPress={g.locate} style={[styles.locate, { backgroundColor: c.secondary }]}>
            <GenerationIcon name="locate" /><AppText variant="label">현재 위치</AppText>
          </Pressable></View>
        <AppText testID="selected-center" variant="label">{g.mapMoving ? '지도 이동 중… 손을 놓으면 중심이 선택돼요.' : !g.validCenter ? '지원 범위 밖이에요. 지도를 이동해 주세요.' : `계산 중심 ${centerLabel(current.origin)}`}</AppText>
        {map}
        {!g.dataset.synthetic && <><MapCredits /><AppText testID={`route-location-${g.centerState.location.kind}`} variant="caption" style={{ color: c.subtle }}>{locationMessage(g.centerState)}</AppText></>}
        <AppText variant="caption" style={{ color: c.subtle }}>지도 중심 주변 2km에서 코스를 찾아요. 실제 출발 지점은 러닝 준비에서 선택해요.</AppText>
        <AppText variant="heading" weight="bold" style={styles.section}>2. 목표 러닝 거리</AppText>
        <AppText family="roboto" weight="black" variant="metric" style={{ textAlign: 'center' }}>{g.targetKm}<AppText weight="black" variant="heading"> km</AppText></AppText>
        <View style={[styles.row, { flexWrap: 'wrap' }]}>{GENERATION_DISTANCES.map(km => <Choice key={km} id={`distance-${km}`} label={`${km} km`} selected={g.targetKm === km} onPress={() => { g.changeSearch(); g.setTargetKm(km); }} />)}</View>
        <AppText variant="heading" weight="bold" style={styles.section}>3. 코스 모양</AppText>
        <View style={styles.shapes}>{SERVICE_SHAPES.map(shape => <Pressable key={shape.id} testID={`shape-${shape.id}`} accessibilityRole="button"
          accessibilityLabel={shape.name} accessibilityState={{ selected: g.shape === shape.id }} onPress={() => { g.changeSearch(); g.setShape(shape.id as ShapeId); }}
          style={[styles.shape, { width: shapeWidth, borderColor: g.shape === shape.id ? c.selected : c.border, backgroundColor: g.shape === shape.id ? '#FFF0E8' : c.surface }]}>
          <View style={styles.shapeIcon}><GenerationIcon name={shape.id} /></View>
          <AppText variant="label" weight="bold" style={{ color: g.shape === shape.id ? c.selected : c.subtle, textAlign: 'center' }}>{shape.name}</AppText>
        </Pressable>)}</View>
        <Button variant="outline" testID="shape-custom" label="도형 직접 그리기" leading={<GenerationIcon name="draw" />}
          onPress={() => { g.changeSearch(); g.setDrawingOpen(true); }} />
        <Button variant="outline" testID="shape-image" label="도형 이미지 업로드하기" leading={<GenerationIcon name="image" />} onPress={() => { g.changeSearch(); setImageOpen(true); }} />
        {g.shape === 'custom' && g.customTemplate && <View testID="selected-custom-shape" style={styles.row}>
          <DrawingPreview template={g.customTemplate} /><AppText style={{ flex: 1 }} variant="label">사용자 도형을 사용해요. 직접 그리기에서 수정할 수 있어요.</AppText></View>}
        <Button variant="outline" compact label={optionsOpen ? '계산 설정 닫기' : '계산 방식 · 오프라인 설정'} onPress={() => setOptionsOpen(value => !value)} testID="generation-options" />
        {optionsOpen && <View style={styles.sectionBox}>
          <View style={styles.row}>{[{ device: false, label: '서버 계산' }, { device: true, label: '기기 계산·도로 저장' }].map(item =>
            <Choice key={item.label} id={item.device ? 'compute-device' : 'compute-server'} selected={g.deviceOnly === item.device} label={item.label} onPress={() => { g.changeSearch(); g.setDeviceOnly(item.device); }} />)}</View>
          <View style={styles.row}>{modes.map(mode => <Choice key={mode.id} id={`road-mode-${mode.id}`} selected={g.roadMode === mode.id} label={mode.label}
            onPress={() => { g.changeSearch(); g.setRoadMode(mode.id); }} />)}</View>
          <AppText variant="caption">선택한 중심·도형을 서버로 보내 계산해요. 서버 연결 실패 시 기기로 전환해요. 오프라인 사용 전에는 기기 계산으로 해당 지역의 도로를 저장해 주세요. 배경 지도는 별도 인터넷 연결이 필요해요.</AppText>
        </View>}
        {status}
      </> : <>
        {status}
        {map}
        {!g.dataset.synthetic && <MapCredits />}
        {g.overlay && <Toggle label="도형 점선" testID="generation-target-toggle" checked={showTarget} onChange={setShowTarget} />}
        <View style={[styles.results, { backgroundColor: c.navigation }]}>
          <View style={styles.headingRow}><AppText weight="bold">추천 코스 {result?.result.candidates.length ?? 0}개</AppText>
            <Button compact variant="outline" label="조건 수정" testID="generation-edit" onPress={() => chooseTab('conditions')} /></View>
          {result ? <>
            <AppText testID="generation-result-conditions" variant="label">대상 도형: {courseShapes[result.options.shape]} · 목표 {result.options.targetKm} km{'\n'}탐색 중심: {centerLabel(result.origin)}</AppText>
            {changed && <AppText variant="caption">조건을 수정했어요. 아래는 이전 조건으로 생성한 결과예요.</AppText>}
            {result.result.candidates.map((candidate, index) => <Pressable key={index} testID={`candidate-${index}`} accessibilityRole="button"
              accessibilityLabel={`${index + 1}순위 · ${candidate.score.lengthKm.toFixed(2)} km`} accessibilityState={{ selected: g.selected === index }}
              onPress={() => g.setSelected(index)} style={[styles.candidate, { backgroundColor: c.surface, borderColor: g.selected === index ? c.selected : c.divider }]}>
              <View style={[styles.rank, { backgroundColor: g.selected === index ? c.action : c.navigation }]}>
                <AppText weight="black" style={{ color: g.selected === index ? c.onAction : c.text }}>{index + 1}순위</AppText></View>
              <View style={{ flex: 1, gap: 6 }}><AppText variant="caption" style={{ color: c.muted }}>전체 코스 거리</AppText>
                <AppText weight="bold">{candidate.score.lengthKm.toFixed(2)} km</AppText>
                <AppText variant="caption">{result.result.mode === 'free-loop' ? '양방향 순환 코스' : '개발 검증용 코스'}</AppText></View>
            </Pressable>)}
            {!result.result.candidates.length && <AppText testID="generation-empty">조건에 맞는 코스가 없어요. 위치·거리·도형을 바꿔 다시 생성해 보세요.</AppText>}
          </> : <AppText testID="generation-no-result">{busy ? '주변 길을 살펴보고 있어요.' : '조건을 설정하고 코스를 생성해 주세요.'}</AppText>}
        </View>
        {!!result?.result.candidates.length && <AppText variant="caption" testID="course-start-position">{result.liveRoads ? '코스 어디서든 양방향으로 출발할 수 있어요. 코스까지의 접근 경로는 저장 후 러닝 준비에서 확인해요.' : '개발 검증용 가상 코스예요. 실제 러닝에는 사용할 수 없어요.'}</AppText>}
      </>}
      <Button compact variant="outline" testID="route-diagnostics" label={g.diagnostics ? '개발 검증 정보 닫기' : '개발 검증 정보'} onPress={() => g.setDiagnostics(value => !value)} />
      {g.diagnostics && <View style={styles.sectionBox}>
        <View style={styles.row}>{(Object.keys(datasets) as DatasetId[]).map(id => <Choice key={id} id={`dataset-${id}`} label={datasets[id].name} selected={g.datasetId === id}
          onPress={() => { g.reset(); if (id !== g.datasetId) { g.setMapReady(false); g.setMapMoving(false); } g.setDatasetId(id); g.setTargetKm(datasets[id].input.options.targetKm); chooseTab('conditions'); }} />)}</View>
        <AppText variant="caption">{g.dataset.description}</AppText>
        {!g.dataset.synthetic && <View style={styles.row}>{roadLocations.map(sample => <Choice key={sample.id} id={`sample-${sample.id}`} label={sample.label} selected={false}
          onPress={() => { g.changeSearch(); g.center.choose(sample.origin); g.setFixedCenter(true); g.setValidCenter(true); g.setMapMoving(false); }} />)}</View>}
        {result && <><AppText testID="route-timing" variant="caption">전체 소요 {(result.timing.totalMs / 1000).toFixed(2)}초 · {result.execution === 'server' ? '서버' : '기기'} 계산</AppText>
          <AppText testID="reference-comparison" variant="caption">{result.comparison}</AppText>
          <AppText testID="calculation-metrics" variant="caption">노드 {result.metrics.nodes} · 도로 구간 {result.metrics.edges}</AppText>
          {result.result.candidates.map((candidate, i) => <AppText key={i} variant="caption">{i + 1}순위 엔진 점수 {candidate.score.total}점</AppText>)}</>}
      </View>}
    </ScrollView>
    <View style={[styles.footer, { borderColor: c.divider, backgroundColor: c.surface }]}>
      {choosing ? <Button ref={generateButton} testID="calculate-route" label="코스 생성하기" leading={<GenerationIcon name="generate" />} disabled={g.cannotCalculate || busy} onPress={showConfirmation} />
        : result?.result.candidates.length ? <Button testID="generation-detail" label="선택한 코스 상세보기" onPress={detail} />
          : <Button testID="generation-edit-footer" label="조건 설정으로 돌아가기" onPress={() => chooseTab('conditions')} />}
    </View>
    <AppModal presentation="sheet" visible={!!confirmation} title="현재 설정으로 코스 생성할까요?" onClose={() => setConfirmation(null)} returnFocusRef={generateButton}
      footer={<View style={{ gap: space.sm }}><Button label="코스 생성하기" testID="generation-confirm" leading={<GenerationIcon name="confirm" />} onPress={confirm} />
        <Button compact variant="outline" label="취소" testID="generation-confirm-cancel" onPress={() => setConfirmation(null)} /></View>}>
      {confirmation && <View style={[styles.sectionBox, { backgroundColor: c.navigation, width: '100%' }]}>
        <AppText variant="label">탐색 중심: {centerLabel(confirmation.origin)}</AppText>
        <AppText variant="label">목표 러닝 거리: {confirmation.targetKm} km</AppText>
        <AppText variant="label">코스 모양: {courseShapes[confirmation.shape]}</AppText>
      </View>}
      <AppText variant="caption" style={{ color: c.muted }}>설정한 조건으로 최대 5개 코스를 찾아요. 주변 길에 따라 후보가 적거나 없을 수 있어요. 생성 중에는 취소할 수 있어요.</AppText>
    </AppModal>
    {g.drawingOpen && <DrawingEditor initial={g.customTemplate} onCancel={() => g.setDrawingOpen(false)}
      onApply={template => { g.changeSearch(); g.setCustomTemplate(template.map(p => ({ ...p }))); g.setShape('custom'); g.setDrawingOpen(false); }} />}
  </View>;
}

function Choice({ id, label, selected, onPress }: { id: string; label: string; selected: boolean; onPress(): void }) {
  const c = useThemeColors();
  return <Pressable testID={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
    style={{ minHeight: 48, padding: 12, borderRadius: radius.compact, borderWidth: 1, borderColor: selected ? c.selected : c.border, justifyContent: 'center', backgroundColor: selected ? '#FFF0E8' : c.surface }}>
    <AppText variant="label" weight={selected ? 'bold' : 'medium'} style={{ color: selected ? c.selected : c.muted }}>{label}</AppText>
  </Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 24, gap: 12, paddingBottom: 28 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  map: { height: 288, overflow: 'hidden' }, mapNote: { position: 'absolute', top: 8, left: 8, padding: 6, backgroundColor: '#FFFFFFEE' },
  crosshair: { position: 'absolute', top: '50%', left: '50%', width: 26, height: 26, marginLeft: -13, marginTop: -13, justifyContent: 'center', alignItems: 'center' },
  crossLine: { position: 'absolute', backgroundColor: '#FC5602' },
  locate: { minHeight: 48, paddingHorizontal: 12, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 5 },
  section: { marginTop: 20 }, sectionBox: { padding: 16, gap: 12, borderRadius: 16 },
  shapes: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, shape: { minHeight: 96, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, gap: 8 },
  shapeIcon: { height: 44, justifyContent: 'center', alignItems: 'center' },
  status: { padding: 12, borderRadius: 12, gap: 8 }, results: { padding: 16, borderRadius: 20, gap: 12 },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 14, borderWidth: 1.5 },
  rank: { minWidth: 56, minHeight: 56, padding: 6, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  footer: { paddingHorizontal: 24, paddingVertical: 12, borderTopWidth: 1 },
});
