import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import DrawingEditor, { DrawingPreview } from '@/features/route-lab/DrawingEditor';
import { courseFromCalculation } from '@/features/route-lab/saved-course';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import { SERVICE_SHAPES } from '@/modules/route-engine/service-shapes';
import type { ShapeId } from '@/modules/route-engine/types';
import { useThemeColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { candidateDrafts, centerLabel, sameConditions, type GenerationConditions } from './model';
import { consumeRegeneration } from './regeneration-request';
import { Image } from 'expo-image';
import { usePointAddress } from './use-point-address';
import { RecommendationResults } from './RecommendationResults';
import { GenerationConfirmationSheet } from './GenerationConfirmationSheet';
import { GenerationIcon } from './GenerationIcon';
import { GenerationDistanceInput } from './GenerationDistanceInput';
import ImageShapeEditor from './ImageShapeEditor';
import { locationMessage, useCourseGeneration } from './use-course-generation';
import { candidateOverlay } from '@/modules/route-engine/geojson';
import { openServiceTab } from '@/features/service/open-service-tab';
import { PlaceSearch } from './PlaceSearch';
import { useRecommendationTerrain } from './use-recommendation-terrain';
import { consumeCourseLocation } from './location-picker-handoff';

const styleUrl = mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY);
const routeColors = { route: '#FF5264', target: '#5197FE' };

export default function CourseGenerationScreen() {
  const homeParams = useLocalSearchParams<{ homeSection?: string; homeRequest?: string; resetRequest?: string }>();
  const [shapeY, setShapeY] = useState(0);
  const scrolledRequest = useRef('');
  const resetRequest = useRef('');
  const g = useCourseGeneration(), c = useThemeColors(), auth = useAuth();
  const { width, fontScale } = useWindowDimensions();
  const shapeColumns = fontScale >= 1.4 ? 2 : width < 390 ? 3 : 4;
  const shapeWidth = (width - 48 - 10 * (shapeColumns - 1)) / shapeColumns;
  const scroll = useRef<ScrollView>(null), generateButton = useRef<View>(null);
  const [confirmation, setConfirmation] = useState<GenerationConditions | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [place, setPlace] = useState<{ address: string; lat: number; lng: number } | null>(null);
  const generationRef = useRef(g);
  const placeRef = useRef(setPlace);
  useLayoutEffect(() => { generationRef.current = g; placeRef.current = setPlace; }, [g, setPlace]);
  const [showTarget, setShowTarget] = useState(true);
  const [imageOpen, setImageOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const current: GenerationConditions = { origin: g.dataset.synthetic ? g.dataset.input.origin : g.centerState.center,
    shape: g.shape, targetKm: g.targetKm, customTemplate: g.customTemplate };
  const resultConditions = g.completed && { origin: g.completed.origin, ...g.completed.options };
  const changed = !!resultConditions && !sameConditions(current, resultConditions);
  const choosing = g.tab === 'conditions';
  const busy = g.state.kind === 'running';
  const result = g.completed;
  const routes = useMemo(() => result?.liveRoads ? result.result.candidates.map(candidate => candidateOverlay(candidate, result.origin).route.geometry.coordinates.map(([lng, lat]): [number, number] => [lng, lat])) : [], [result]);
  const terrain = useRecommendationTerrain(routes, !choosing && !busy);
  const addressOrigin = choosing ? current.origin : result?.origin ?? current.origin;
  const pointAddress = usePointAddress(addressOrigin, place && Math.abs(place.lat-addressOrigin.lat)<0.00001 && Math.abs(place.lng-addressOrigin.lng)<0.00001 ? place.address : '');
  const locationLabel = (origin: {lat: number; lng: number}) => place && Math.abs(place.lat-origin.lat)<0.00001 && Math.abs(place.lng-origin.lng)<0.00001 ? place.address : pointAddress.label;
  useFocusEffect(useCallback(() => () => { setConfirmation(null); setImageOpen(false); }, []));
  useFocusEffect(useCallback(() => {
    const picked = consumeCourseLocation();
    if (!picked) return;
    const state = generationRef.current;
    state.changeSearch(); state.center.choose(picked.origin); state.setFixedCenter(true);
    state.setValidCenter(true); state.setMapMoving(false);
    placeRef.current(picked.address ? { ...picked.origin, address: picked.address } : null);
  }, []));
  useFocusEffect(useCallback(() => {
    if (!homeParams.resetRequest || resetRequest.current === homeParams.resetRequest) return;
    resetRequest.current = homeParams.resetRequest;
    const agreed=consumeRegeneration(homeParams.resetRequest,auth.account?.id??'guest'),state=generationRef.current;
    if(!agreed){state.reset();state.setTab('conditions');return;}
    state.setTargetKm(agreed.targetKm);state.setShape(agreed.shape);state.setCustomTemplate(agreed.customTemplate??null);
    state.center.choose(agreed.origin);state.setFixedCenter(true);state.setValidCenter(true);state.setMapMoving(false);
    state.reset();state.setTab('conditions');
  }, [homeParams.resetRequest,auth.account?.id]));
  const [draftOwner,setDraftOwner]=useState(auth.account?.id);
  if(draftOwner!==auth.account?.id){
    setDraftOwner(auth.account?.id);setConfirmation(null);setImageOpen(false);setPlace(null);
  }
  const chooseTab = (tab: 'conditions' | 'results') => { g.setTab(tab); };
  useEffect(() => {
    // Wait for the new form to reach the native scroll view before resetting it.
    const frame=requestAnimationFrame(()=>scroll.current?.scrollTo({y:0,animated:false}));
    return ()=>cancelAnimationFrame(frame);
  },[g.tab]);
  useEffect(() => {
    if (homeParams.homeSection !== 'shapes' || !homeParams.homeRequest || scrolledRequest.current === homeParams.homeRequest || !choosing || !shapeY) return;
    const frame = requestAnimationFrame(() => { scroll.current?.scrollTo({ y: shapeY, animated: false }); scrolledRequest.current = homeParams.homeRequest!; });
    return () => cancelAnimationFrame(frame);
  }, [homeParams.homeSection, homeParams.homeRequest, choosing, shapeY]);
  const showConfirmation = () => {
    if (g.cannotCalculate || busy) return;
    Keyboard.dismiss();
    setRegenerating(false);
    setNotice('');
    setConfirmation({ ...current, origin: { ...current.origin }, customTemplate: current.customTemplate?.map(p => ({ ...p })) });
  };
  const confirm = () => {
    const agreed = confirmation;
    setConfirmation(null);
    if (!agreed || (!regenerating && (!sameConditions(agreed, current) || g.cannotCalculate))) {
      setNotice('조건이 바뀌었어요. 현재 조건을 다시 확인해 주세요.'); return;
    }
    if (regenerating) {
      g.setTargetKm(agreed.targetKm); g.setShape(agreed.shape); g.setCustomTemplate(agreed.customTemplate ?? null);
      if (!g.dataset.synthetic) { g.center.choose(agreed.origin); g.setFixedCenter(true); g.setValidCenter(true); g.setMapMoving(false); }
    }
    g.start(agreed); scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const detail = (run = false, index = g.selected, mapOnly = false) => {
    if (!result) return;
    try {
      const draft = candidateDrafts.put(courseFromCalculation(result, index), index + 1, auth.account?.id ?? 'guest',result.result.candidates.length);
      if (mapOnly) { router.push({ pathname: '/course-map', params: { draft, target: showTarget ? '1' : '0' } }); return; }
      const saved = candidateDrafts.get(draft, auth.account?.id ?? 'guest')?.savedId;
      if (run && saved) { openServiceTab({ pathname: '/run', params: { courseId: saved } }); return; }
      router.push({ pathname: '/course-candidate', params: { draft, ...(run ? { intent: 'run' } : {}) } });
    } catch { setNotice('선택한 코스를 열지 못했어요. 다시 생성해 주세요.'); }
  };
  const openLocationPicker = () => router.push({ pathname: '/course-location-picker', params: {
    lat: String(current.origin.lat), lng: String(current.origin.lng), ...(place ? { address: place.address } : {}),
  } });
  const previewSelection = useMemo(() => ({ target: g.centerState.cameraTarget, onMoveStart: () => undefined, onMoveEnd: () => undefined, onReady: g.setMapReady }), [g.centerState.cameraTarget, g.setMapReady]);
  const map = <View style={[styles.map, { backgroundColor: c.navigation, borderRadius: choosing ? radius.card : 0 }]}>
    <MapSurface key={g.datasetId} styleUrl={styleUrl ?? ''} position={null}
      origin={choosing ? current.origin : result?.origin ?? current.origin} syntheticRoads={g.roads}
      routeOverlay={choosing ? null : g.overlay} showTarget={showTarget} routeColors={routeColors}
      centerSelection={choosing && !g.dataset.synthetic ? previewSelection : undefined} interactive={false} />
    {choosing && !g.dataset.synthetic && <Pressable testID="course-map-preview-open" accessibilityRole="button" accessibilityLabel={`지도에서 위치 선택. 탐색 중심 ${centerLabel(current.origin)}`}
      onPress={openLocationPicker} style={[StyleSheet.absoluteFill, { bottom: 40 }]} />}
    {choosing && !g.dataset.synthetic && <View pointerEvents="none" style={styles.crosshair}>
      <View style={[styles.crossLine, { width: 26, height: 2 }]} /><View style={[styles.crossLine, { width: 2, height: 26 }]} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.selected, borderWidth: 2, borderColor: c.surface }} />
    </View>}
    {choosing && !g.dataset.synthetic && <Pressable testID="route-locate" accessibilityRole="button" accessibilityLabel="현재 위치"
      accessibilityState={{ disabled: g.centerState.location.kind === 'loading', busy: g.centerState.location.kind === 'loading' }}
      disabled={g.centerState.location.kind === 'loading'} onPress={() => { Keyboard.dismiss(); g.locate(); }} style={styles.mapLocateTarget}>
      <View style={[styles.mapLocateButton, { backgroundColor: c.surface, borderColor: c.outline }]}>
        {g.centerState.location.kind === 'loading' ? <ActivityIndicator size="small" color={c.text} /> : <GenerationIcon name="locate" />}
      </View>
    </Pressable>}
    {g.dataset.synthetic && <View style={styles.mapNote}><AppText variant="caption">가상 도로 · 실제 길 아님</AppText></View>}
  </View>;
  const status = <View testID={`calculation-${g.state.kind}`} accessibilityLiveRegion="polite" style={[styles.status, { backgroundColor: c.navigation }]}>
    {busy && <ActivityIndicator color={c.action} />}
    <AppText variant="label" style={{ flexShrink: 1 }}>{g.state.message}</AppText>
    {busy && <><AppText variant="caption">{g.seconds.toFixed(1)}초</AppText><Button compact variant="outline" label="취소" testID="cancel-route" onPress={() => g.cancel()} /></>}
  </View>;
  return <View style={[styles.screen, { backgroundColor: c.background }]} testID="course-generation">
    {imageOpen && <ImageShapeEditor onCancel={() => setImageOpen(false)} onApply={points => { g.changeSearch(); g.setCustomTemplate(points); g.setShape('custom'); setImageOpen(false); }} />}
    {choosing ? <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {!!notice && <AppText accessibilityRole="alert">{notice}</AppText>}
      {!!g.pendingRequest && <View style={{ gap: 10 }}><AppText>확인이 끝나지 않은 생성 작업이 있어요. 이전 결과를 복원해 주세요. 추가 횟수는 사용하지 않습니다.</AppText><Button label="이전 생성 결과 복원" disabled={busy} onPress={g.restore}/></View>}
      {<>
        {changed && <AppText testID="generation-changed" variant="label">이전 계산 결과를 보관하고 있어요. 다시 생성하면 새 조건이 적용돼요.</AppText>}
        {!!result && <Button compact variant="outline" testID="generation-view-results" label="이전 추천 코스 보기" onPress={() => chooseTab('results')} />}
        <AppText variant="heading" weight="bold">1. 출발 위치</AppText>
        {!g.dataset.synthetic && <PlaceSearch variant="course" key={`place-${auth.account?.id ?? 'guest'}`} center={current.origin} onChoose={selected => {
          g.changeSearch(); g.center.choose(selected.center); g.setFixedCenter(true); g.setValidCenter(true); g.setMapMoving(false);
          setPlace({ address: selected.address, ...selected.center });
        }} />}
        {!g.validCenter && <AppText accessibilityRole="alert" variant="label">지원 범위 밖이에요.</AppText>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Image source={require('../../../assets/generation/figma-20261107/address-pin.svg')} style={{ width: 14, height: 14 }} accessible={false} contentFit="contain" />
          <AppText testID="generation-origin-address" family="roboto" weight="medium" variant="caption" style={{ flex: 1 }}>{pointAddress.label}</AppText>
        </View>
        {map}
        {['denied', 'services-disabled', 'timeout', 'unavailable'].includes(g.centerState.location.kind) && <AppText variant="caption" accessibilityLiveRegion="polite" style={{ color: c.subtle }}>{locationMessage(g.centerState)}</AppText>}
        {!g.dataset.synthetic && <Button variant="outline" testID="course-map-preview-select" label="지도에서 위치 선택" leading={<GenerationIcon name="mapPin" />} onPress={openLocationPicker}
          contentStyle={[styles.locationButton, { borderColor: c.subtle, backgroundColor: c.background === '#FFFFFF' ? '#FCFCFC' : c.surface }]}
          labelStyle={{ fontSize: 18, lineHeight: 27.6, color: c.background === '#FFFFFF' ? '#1E1E1E' : c.text }} />}
        <GenerationDistanceInput key={`distance-${auth.account?.id ?? 'guest'}`} value={g.targetKm} onChange={km => { g.changeSearch(); g.setTargetKm(km); }} />
        <AppText variant="heading" weight="bold" style={styles.section}>3. 코스 모양</AppText>
        <View testID="generation-shapes" onLayout={event => setShapeY(event.nativeEvent.layout.y)} style={styles.shapes}>{SERVICE_SHAPES.map(shape => <Pressable key={shape.id} testID={`shape-${shape.id}`} accessibilityRole="button"
          accessibilityLabel={shape.name} accessibilityState={{ selected: g.shape === shape.id }} onPress={() => { g.changeSearch(); g.setShape(shape.id as ShapeId); }}
          style={[styles.shape, { width: shapeWidth, borderColor: g.shape === shape.id ? c.selected : c.border, backgroundColor: g.shape === shape.id ? '#FFF0E8' : c.surface }]}>
          <View style={styles.shapeIcon}><GenerationIcon name={shape.id} color={g.shape===shape.id?c.selected:c.subtle} /></View>
          <AppText variant="label" weight="bold" style={{ color: g.shape === shape.id ? c.selected : c.subtle, textAlign: 'center' }}>{shape.name}</AppText>
        </Pressable>)}</View>
        <View style={styles.shapeActions}>
          <Button variant="outline" testID="shape-custom" label="도형 직접 그리기" leading={<GenerationIcon name="draw" />}
            contentStyle={[styles.shapeActionButton, { borderColor: c.outline, backgroundColor: c.background === '#FFFFFF' ? '#FCFCFC' : c.surface }]}
            labelStyle={{ fontSize: 18, lineHeight: 26, color: c.background === '#FFFFFF' ? '#1E1E1E' : c.text }}
            onPress={() => { g.changeSearch(); g.setDrawingOpen(true); }} />
          <Button variant="outline" testID="shape-image" label="도형 이미지 업로드하기" leading={<GenerationIcon name="image" />}
            contentStyle={[styles.shapeActionButton, { borderColor: c.outline, backgroundColor: c.background === '#FFFFFF' ? '#FCFCFC' : c.surface }]}
            labelStyle={{ fontSize: 18, lineHeight: 26, color: c.background === '#FFFFFF' ? '#1E1E1E' : c.text }}
            onPress={() => { g.changeSearch(); setImageOpen(true); }} />
        </View>
        {g.shape === 'custom' && g.customTemplate && <View testID="selected-custom-shape" style={styles.row}>
          <DrawingPreview template={g.customTemplate} /><AppText style={{ flex: 1 }} variant="label">사용자 도형을 사용해요. 직접 그리기에서 수정할 수 있어요.</AppText></View>}
        {g.state.kind !== 'idle' && status}
        <View style={styles.generateAction}>
          <Button ref={generateButton} testID="calculate-route" label="코스 생성하기" leading={<GenerationIcon name="generate" />} disabled={g.cannotCalculate || busy} onPress={showConfirmation} />
          <AppText testID="generation-charge-notice" variant="caption" weight="medium" style={[styles.chargeNotice, { color: c.subtle }]}>코스를 생성하면 보유한 횟수가 1회 차감됩니다.</AppText>
        </View>
      </>}
    </ScrollView> : <RecommendationResults g={g} terrain={terrain} location={locationLabel(result?.origin ?? current.origin)}
      showTarget={showTarget} onTarget={setShowTarget} onEdit={() => {if(!result){g.reset();g.setTab('conditions');return;}Alert.alert('재설정 및 재생성하기','저장하지 않은 생성 코스는 삭제되고 코스 설정 페이지로 이동합니다.',[{text:'취소',style:'cancel'},{text:'확인',onPress:()=>{candidateDrafts.discardUnsaved(auth.account?.id??'guest');g.reset();g.setTab('conditions');}}]);}} onDetail={index => detail(false, index)}
      onMap={() => detail(false, g.selected, true)} onRun={() => detail(true)} status={status} />}
    <GenerationConfirmationSheet conditions={confirmation} location={confirmation ? locationLabel(confirmation.origin) : ''}
      regenerating={regenerating} onClose={() => setConfirmation(null)} onConfirm={confirm} returnFocusRef={generateButton} />
    {g.drawingOpen && <DrawingEditor initial={g.customTemplate} onCancel={() => g.setDrawingOpen(false)}
      onApply={template => { g.changeSearch(); g.setCustomTemplate(template.map(p => ({ ...p }))); g.setShape('custom'); g.setDrawingOpen(false); }} />}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 24, gap: 12, paddingBottom: 28 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  map: { height: 288, overflow: 'hidden' }, mapNote: { position: 'absolute', top: 8, left: 8, padding: 6, backgroundColor: '#FFFFFFEE' },
  crosshair: { position: 'absolute', top: '50%', left: '50%', width: 26, height: 26, marginLeft: -13, marginTop: -13, justifyContent: 'center', alignItems: 'center' },
  crossLine: { position: 'absolute', backgroundColor: '#FC5602' },
  mapLocateTarget: { position: 'absolute', right: 25, top: 20, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  mapLocateButton: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  shapeActions: { marginTop: 38, gap: 15 },
  shapeActionButton: { minHeight: 40, borderRadius: 10, borderWidth: 1, justifyContent: 'flex-start', paddingHorizontal: 19, paddingVertical: 7, gap: 14 },
  locationButton: { minHeight: 50, borderRadius: 10, borderWidth: 1, gap: 14, paddingVertical: 10 },
  generateAction: { marginTop: 38, gap: 14 }, chargeNotice: { textAlign: 'center', lineHeight: 20 },
  section: { marginTop: 20 }, sectionBox: { padding: 16, gap: 12, borderRadius: 16 },
  shapes: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, shape: { minHeight: 96, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, gap: 8 },
  shapeIcon: { height: 48, justifyContent: 'center', alignItems: 'center' },
  status: { padding: 12, borderRadius: 12, gap: 8 }, results: { padding: 16, borderRadius: 20, gap: 12 },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 14, borderWidth: 1.5 },
  rank: { minWidth: 56, minHeight: 56, padding: 6, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  footer: { paddingHorizontal: 24, paddingVertical: 12, borderTopWidth: 1 },
});
