import type { TerrainProfile } from '../../modules/terrain/model.ts';

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
