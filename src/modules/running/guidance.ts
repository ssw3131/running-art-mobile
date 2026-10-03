import { courseId, courseName, decodeSnapshot, encodeSnapshot, type CourseSnapshot } from '../courses/model.ts';
import { createGuidance, GUIDANCE_LIMITS, type GuidanceCheckpoint, type GuidanceState } from '../guidance/engine.ts';
import { distance } from '../guidance/geometry.ts';
import { RunError, type Fix } from './model.ts';

export type CourseOutcome = 'active' | 'arrival-pending' | 'finished' | 'stopped';
export type RunCourse = { id: string; name: string; snapshot: CourseSnapshot };
export type GuidanceOptions = { voice: boolean; background: boolean; mode: 'map' | 'focus' };
export const defaultGuidanceOptions: GuidanceOptions = { voice: true, background: true, mode: 'map' };
export type RunGuidance = { course: RunCourse; checkpoint: GuidanceCheckpoint; options: GuidanceOptions; state: GuidanceState };
export type GuidanceRow = { course_id: string | null; course_name: string | null; course_snapshot_json: string | null;
  course_snapshot_hash: string | null; guidance_json: string | null; guidance_options_json: string | null };
export const guidanceColumns = 'course_id,course_name,course_snapshot_json,course_snapshot_hash,guidance_json,guidance_options_json';
export function validateRunCourse(value: unknown): RunCourse {
  const c = value as RunCourse;
  if (!c) throw new RunError('러닝 코스 정보를 확인할 수 없어요.');
  const snapshot = encodeSnapshot(c.snapshot).snapshot;
  if (snapshot.source !== 'osm') throw new RunError('가상 테스트 코스는 실제 GPS 러닝에 사용할 수 없어요.');
  return { id: courseId(c.id), name: courseName(c.name), snapshot };
}
export function readRunGuidance(row: GuidanceRow): RunGuidance | null {
  if (row.course_id === null) return null;
  const course = validateRunCourse({ id: row.course_id, name: row.course_name,
    snapshot: decodeSnapshot(row.course_snapshot_json!, row.course_snapshot_hash!) });
  const engine = createGuidance(course.snapshot.route, row.guidance_json ? JSON.parse(row.guidance_json) : undefined);
  const options = row.guidance_options_json ? validateGuidanceOptions(JSON.parse(row.guidance_options_json)) : { ...defaultGuidanceOptions };
  return { course, checkpoint: engine.checkpoint(), options, state: engine.snapshot() };
}
export function validateGuidanceOptions(value: GuidanceOptions): GuidanceOptions {
  if (!value || typeof value.voice !== 'boolean' || typeof value.background !== 'boolean' || !['map', 'focus'].includes(value.mode)) throw new RunError('러닝 안내 설정이 올바르지 않아요.');
  return { voice: value.voice, background: value.background, mode: value.mode };
}
export function startReadiness(course: RunCourse, fix: Fix | null, now: number) {
  if (!fix || !Number.isFinite(fix.timestamp) || now - fix.timestamp > 5000 || fix.timestamp > now ||
    !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude) || Math.abs(fix.latitude) > 85 || Math.abs(fix.longitude) > 180 ||
    fix.accuracy === null || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > GUIDANCE_LIMITS.accuracy) {
    return { ready: false, distanceM: null, message: '정확한 현재 위치를 확인해 주세요. 정확도 30m 이내의 최신 위치가 필요해요.' };
  }
  const distanceM = distance([fix.longitude, fix.latitude], course.snapshot.route[0]);
  return { ready: distanceM <= 25, distanceM, message: distanceM <= 25 ? '출발 준비가 됐어요. 코스의 정방향으로 출발해 주세요.' : `코스 출발점까지 약 ${Math.round(distanceM)}m예요. 출발점 25m 이내로 이동해 주세요.` };
}
