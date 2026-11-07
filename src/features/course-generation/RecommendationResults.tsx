import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { useThemeColors } from '@/theme/ThemeProvider';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import type { useCourseGeneration } from './use-course-generation';
import type { useRecommendationTerrain } from './use-recommendation-terrain';
import { estimatedRunningMinutes, similarityPercent } from './recommendation-metrics';
import { DifficultyTag } from './DifficultyTag';
import { TargetVisibilityButton } from './TargetVisibilityButton';
import { GenerationIcon } from './GenerationIcon';

export function RecommendationResults({ g, terrain, location, showTarget, onTarget, onEdit, onDetail, onMap, onRun, status }: {
  g: ReturnType<typeof useCourseGeneration>; terrain: ReturnType<typeof useRecommendationTerrain>; location: string; showTarget: boolean;
  onTarget(value: boolean): void; onEdit(): void; onDetail(index: number): void; onMap(): void; onRun(): void; status: ReactNode;
}) {
  const c = useThemeColors(), { height, fontScale } = useWindowDimensions();
  const result = g.completed, busy = g.state.kind === 'running', candidates = result?.result.candidates ?? [];
  return <View testID="recommendation-results" style={{ flex: 1 }}>
    <View testID="recommendation-fixed-map" style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderColor: c.divider }}>
      <View style={styles.heading}><AppText variant="caption" style={{ flex: 1 }} numberOfLines={2}>출발지 : {location}</AppText>
</View>
      <View style={{ height: Math.min(288, Math.max(160, height * 0.29)), borderRadius: 16, overflow: 'hidden' }}>
        <MapSurface styleUrl={mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY) ?? ''} position={null} origin={result?.origin}
          syntheticRoads={g.roads} routeOverlay={g.overlay} showTarget={showTarget} interactive={false} routeColors={{ route: '#FF5264', target: '#5197FE' }} />
        {!!candidates.length && <Pressable testID="recommendation-map-open" accessibilityRole="button" accessibilityLabel="지도에서 코스 보기" onPress={onMap}
          style={[styles.mapOpen, { backgroundColor: c.surface, borderColor: c.outline }]}>
          <Image source={require('../../../assets/generation/recommendations/search.svg')} style={{ width: 20, height: 20 }} contentFit="contain" accessible={false} />
        </Pressable>}
        <TargetVisibilityButton testID="generation-target-toggle" checked={showTarget} onChange={onTarget} style={{ position: 'absolute', left: 20, bottom: 18 }} />
      </View>
    </View>
    <ScrollView testID="recommendation-list-scroll" style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {(busy || g.state.kind === 'error' || g.state.kind === 'cancelled') && status}
      <View testID={g.state.kind === 'done' ? 'calculation-done' : undefined} style={[styles.list, { backgroundColor: c.background }]}>
        <AppText weight="bold" style={{ fontSize: 18, lineHeight: 26 }}>유사도가 높은 추천 코스 {candidates.length}개</AppText>
        {candidates.map((candidate, index) => <View key={index} style={[styles.card, { borderColor: g.selected === index ? c.action : c.divider, backgroundColor: c.surface }]}>
          <Pressable testID={`candidate-${index}`} accessibilityRole="button" accessibilityLabel={`유사도 ${similarityPercent(candidate.score.raw)}% · ${candidate.score.lengthKm.toFixed(2)} km · 예상 러닝 시간 약 ${estimatedRunningMinutes(candidate.score.lengthKm)}분`}
            accessibilityState={{ selected: g.selected === index }} onPress={() => g.setSelected(index)} style={[styles.selection, { flexWrap: fontScale >= 1.4 ? 'wrap' : 'nowrap' }]}>
            <View style={[styles.rank, { backgroundColor: g.selected === index ? c.action : c.navigation }]}>
              <AppText family="roboto" weight="black" style={{ fontSize: 20, color: g.selected === index ? c.onAction : c.text }}>{similarityPercent(candidate.score.raw)}%</AppText></View>
            <View style={{ flex: 1, minWidth: 110, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}><AppText style={[styles.label, { color: c.muted }]}>코스 난이도 :</AppText><DifficultyTag state={result?.liveRoads ? terrain.states[index] ?? { kind: 'loading' } : undefined} /></View>
              <AppText style={[styles.label, { color: c.muted }]}>총 러닝 거리 : <AppText weight="bold" style={styles.value}>{candidate.score.lengthKm.toFixed(2)}km</AppText></AppText>
              <AppText style={[styles.label, { color: c.muted }]}>예상 러닝 시간 : <AppText weight="bold" style={styles.value}>약 {estimatedRunningMinutes(candidate.score.lengthKm)}분</AppText></AppText>
            </View>
          </Pressable>
          <Pressable testID={`candidate-detail-${index}`} accessibilityRole="button" accessibilityLabel={`${index + 1}번 추천 코스 상세보기`} onPress={() => onDetail(index)} style={styles.detail}>
            <AppText weight="semibold" style={{ width: 29, fontSize: 14, lineHeight: 19, color: c.subtle }}>상세보기</AppText>
            <Image source={require('../../../assets/generation/figma-20261107/chevron.svg')} style={{ width: 20, height: 20 }} contentFit="contain" accessible={false} />
          </Pressable>
        </View>)}
        {!candidates.length && <AppText testID={result ? 'generation-empty' : 'generation-no-result'}>{busy ? '주변 길을 살펴보고 있어요.' : '조건에 맞는 코스가 없어요. 위치·거리·도형을 바꿔 다시 생성해 보세요.'}</AppText>}
      </View>
      {terrain.states.some(state => state.kind === 'error') && <Button compact variant="outline" label="난이도 다시 조회" onPress={terrain.retry} />}
    <View testID="recommendation-actions" style={{ paddingHorizontal: 10, paddingVertical: 28, gap: 20, backgroundColor: c.surface }}>
      <Button variant="secondary" label="재설정 및 재생성하기" testID="generation-edit" onPress={onEdit} disabled={busy} labelStyle={{ fontSize: 16 }} />
      {!!candidates.length && result?.liveRoads && <Button label="실시간 러닝 시작하기" testID="generation-run" leading={<GenerationIcon name="run" />} onPress={onRun} />}
    </View>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  mapOpen: { position: 'absolute', right: 24, bottom: 18, width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 0, gap: 12 },
  card: { minHeight: 100, flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, overflow: 'hidden' },
  selection: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingVertical: 12 },
  rank: { minWidth: 56, minHeight: 56, padding: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, lineHeight: 20 }, value: { fontSize: 15, lineHeight: 20 }, detail: { width: 64, minHeight: 100, flexDirection: 'row', gap: 2, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
});
