import { useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, Toggle } from '@/components/ui';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';
import { useAuth } from '@/features/auth/use-auth';
import { CourseEditor } from '@/features/courses/SaveCoursePanel';
import { openServiceTab } from '@/features/service/open-service-tab';
import { serviceTabs } from '@/features/service/navigation';
import TerrainPanel from '@/features/terrain/TerrainPanel';
import { useTerrain } from '@/features/terrain/use-terrain';
import { courseShapes, savedCourseOverlay } from '@/modules/courses/model';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import { useThemeColors } from '@/theme/ThemeProvider';
import { candidateDrafts, centerLabel } from './model';
import { MapCredits } from './MapCredits';

const styleUrl = mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY);
const emptyRoads = { type: 'FeatureCollection' as const, features: [] };
const routeColors = { route: '#FF5264', target: '#5197FE' };
export default function CandidateScreen() {
  const { draft: id } = useLocalSearchParams<{ draft?: string }>(), auth = useAuth(), c = useThemeColors(), insets = useSafeAreaInsets();
  const scope = auth.account?.id ?? 'guest';
  const scroll = useRef<ScrollView>(null);
  const draft = useMemo(() => candidateDrafts.get(id, scope), [id, scope]);
  const snapshot = draft?.snapshot;
  const overlay = useMemo(() => snapshot ? savedCourseOverlay(snapshot) : null, [snapshot]);
  const [showTarget, setShowTarget] = useState(true), [background, setBackground] = useState(true);
  const terrain = useTerrain(snapshot?.source === 'osm' ? snapshot.route : undefined);
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} testID="candidate-detail">
      {draft && snapshot ? <>
        <View style={styles.map}><MapSurface styleUrl={styleUrl ?? ''} position={null} origin={snapshot.origin} routeOverlay={overlay}
          syntheticRoads={snapshot.source === 'synthetic' || !background || !styleUrl ? emptyRoads : undefined}
          terrainOverlay={terrain.overlay} showTarget={showTarget} routeColors={routeColors} /></View>
        {snapshot.source === 'osm' && background && styleUrl && <MapCredits />}
        <View style={styles.row}><Toggle label="도형 점선" testID="candidate-target-toggle" checked={showTarget} onChange={setShowTarget} />
          {snapshot.source === 'osm' && <Toggle label="배경 지도" checked={background} onChange={setBackground} testID="candidate-map-toggle" />}</View>
        <View style={[styles.summary, { backgroundColor: c.surface, borderColor: c.divider }]}>
          <AppText testID="candidate-title" weight="black" variant="title" style={{ textAlign: 'center' }}>{courseShapes[snapshot.shape]} 코스 · {draft.rank}순위</AppText>
          <View style={{ height: 1, backgroundColor: c.divider }} />
          <AppText variant="label" style={{ color: c.subtle }}>전체 코스 거리</AppText>
          <AppText testID="candidate-distance" family="roboto" weight="black" variant="metric">{snapshot.lengthKm.toFixed(2)}<AppText weight="bold"> km</AppText></AppText>
        </View>
        <AppText testID="candidate-conditions">대상 도형: {courseShapes[snapshot.shape]}{'\n'}목표 거리: {snapshot.targetKm} km{'\n'}탐색 중심: {centerLabel(snapshot.origin)}</AppText>
        <View style={[styles.note, { backgroundColor: c.navigation }]}>
          <AppText variant="label" weight="bold">코스를 확인해 주세요</AppText>
          <AppText variant="caption">{snapshot.source === 'synthetic' ? '개발 검증용 가상 도로예요. 실제 러닝에는 사용할 수 없어요.' : '탐색 중심과 실제 출발 지점은 달라요. 저장 후 러닝 준비에서 현재 위치부터의 접근 경로와 진행 방향을 확인할 수 있어요.'}</AppText>
          <AppText variant="caption">지도에 표시된 길과 실제 보행 가능 여부를 확인하고, 교차로 신호와 현장 안내를 따라 주세요.</AppText>
        </View>
        {snapshot.source === 'osm' && <TerrainPanel controller={terrain.controller} state={terrain.state} />}
        <CourseEditor key={id} snapshot={snapshot} selected={draft.rank - 1} initialName={draft.name} initialSavedId={draft.savedId} scrollRef={scroll}
          onDraftChange={value => candidateDrafts.edit(draft.id, scope, value)} />
      </> : <View style={styles.note}>
        <AppText testID="candidate-expired" variant="heading">후보를 다시 선택해 주세요</AppText>
        <AppText>앱을 다시 시작했거나 다른 계정의 후보예요. 저장한 코스는 보관함에서 확인할 수 있어요.</AppText>
        <Button label="코스 생성으로" onPress={() => openServiceTab('/route-lab')} />
        <Button variant="outline" label="저장한 코스 보기" onPress={() => openServiceTab({ pathname: '/courses', params: { view: 'courses' } })} />
      </View>}
    </ScrollView>
    <BottomTabBar value="courses" bottomInset={insets.bottom} onChange={value => {
      const tab = serviceTabs.find(item => item.value === value);
      if (tab) openServiceTab(tab.href);
    }} />
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  content: { padding: 24, gap: 20, paddingBottom: 32 }, map: { height: 320, marginHorizontal: -24 },
  row: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  summary: { padding: 20, borderRadius: 20, borderWidth: 1, gap: 12, boxShadow: '0px 0px 5px rgba(0,0,0,0.15)' },
  note: { padding: 16, borderRadius: 10, gap: 12 },
});
