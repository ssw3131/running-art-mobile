import { View } from 'react-native';
import { AppText } from '@/components/ui';
import type { TerrainState } from '@/modules/terrain/controller';
import { DifficultyTag } from './DifficultyTag';
import { estimatedRunningMinutes, paceExplanation, similarityExplanation, similarityPercent, terrainDifficulty } from './recommendation-metrics';

export function CourseMetrics({ lengthKm, score, terrain }: { lengthKm: number; score: number; terrain: TerrainState }) {
  const difficulty = terrain.profile ? terrainDifficulty(terrain.profile) : null;
  return <View style={{ gap: 8 }}>
    <AppText>유사도 : {similarityPercent(score)}%</AppText>
    <AppText>예상 러닝 시간 : 약 {estimatedRunningMinutes(lengthKm)}분</AppText>
    <DifficultyTag state={{ kind: terrain.profile ? 'ready' : terrain.status === 'loading' ? 'loading' : 'error', profile: terrain.profile ?? undefined }} />
    {difficulty && <AppText variant="caption">평균 절대 경사 {difficulty.meanGrade.toFixed(1)}% · 총 오르막 {Math.round(difficulty.ascent)}m · 6% 이상 경사 구간 {(difficulty.steepMeters/1000).toFixed(2)}km</AppText>}
    <AppText variant="caption">{paceExplanation}</AppText>
    <AppText variant="caption">{similarityExplanation}</AppText>
    <AppText variant="caption">경사 난이도: 초급 3% 미만 · 중급 3~6% 미만 · 상급 6% 이상. 추천 순서에는 반영하지 않아요.</AppText>
  </View>;
}
