import type { TerrainProfile } from '../../modules/terrain/model.ts';
import type { SearchResult } from '../../modules/route-engine/types.ts';
import { MIN_RECOMMENDATION_SCORE } from '../../modules/route-engine/nearby-policy.ts';

export const noQualifiedCourseMessage = `유사도 ${MIN_RECOMMENDATION_SCORE}% 이상인 코스를 찾지 못했어요. 위치·거리·도형을 바꿔 보세요.`;
export function nearbyExplanation(result: SearchResult) {
  const p = result.proximity;
  if (!p) return '';
  if (!p.sourceKnown) return '출발지의 보행 도로 연결을 확인하지 못했어요. 접근 거리는 확인 불가로 표시하며 코스를 자동 선택하지 않아요.';
  if (!result.candidates.length) return '';
  const connected = result.candidates.filter(c => c.approach);
  const message = p.comparisonRequired
    ? '가까운 코스와 모양이 더 닮은 코스의 유사도 차이가 5점을 넘어요. 이동 거리와 모양을 비교해 선택해 주세요.'
    : connected.length && connected.every(c => c.approach!.distanceM > 1000)
      ? '합류 1km 이내에 유사도 기준을 만족하는 코스가 없어 더 먼 대안을 표시했어요.'
      : p.defaultIndex === null
        ? '코스까지의 합류 경로를 확인하지 못했어요. 접근 거리는 확인 불가로 표시하며 코스를 자동 선택하지 않아요.'
        : '접근 거리와 모양을 함께 고려한 가까운 코스를 추천해요.';
  return message + (p.stages.length > 1 ? ` 가까운 범위에서 유사도 기준을 만족하는 후보를 찾지 못해 ${p.stages.join('m → ')}m 순으로 넓혀 찾았어요.` : '');
}

export const DEFAULT_RUNNING_SECONDS_PER_KM = 390;
export const similarityExplanation = '윤곽 45% · 진행 흐름 25% · 꺾임 20% · 거리 적합도 10%에서 반복 구간을 감점한 종합 점수예요. 모양 일치 확률은 아니에요.';
export const paceExplanation = '1km당 6분 30초 기준 예상이에요. 개인 페이스·경사·휴식·신호 대기·합류 시간은 반영하지 않아요.';
export function estimatedRunningMinutes(lengthKm: number) {
  return Number.isFinite(lengthKm) && lengthKm > 0 ? Math.max(1, Math.round(lengthKm * DEFAULT_RUNNING_SECONDS_PER_KM / 60)) : null;
}
export function similarityPercent(score: number) { return Math.round(Math.max(0, Math.min(100, score))); }
export function terrainDifficulty(profile: TerrainProfile) {
  if (profile.length <= 0 || profile.points.length !== profile.segments.length + 1) return null;
  let gradeDistance = 0, steepMeters = 0, meters = 0;
  for (let i = 0; i < profile.segments.length; i++) {
    const length = profile.points[i + 1].distance - profile.points[i].distance;
    const grade = Math.abs(profile.segments[i].grade);
    if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(grade)) return null;
    gradeDistance += grade * length; meters += length;
    if (grade >= 6) steepMeters += length;
  }
  const meanGrade = gradeDistance / meters;
  const level = meanGrade < 3 ? 0 : meanGrade < 6 ? 1 : 2;
  return { level, label: ['초급 코스', '중급 코스', '상급 코스'][level], meanGrade, steepMeters, ascent: profile.ascent };
}
