import { courseId, courseName, decodeSnapshot, encodeSnapshot, type CourseSnapshot } from '../courses/model.ts';
import { createGuidance, GUIDANCE_LIMITS, type GuidanceCheckpoint, type GuidanceState } from '../guidance/engine.ts';
import { RunError, type Fix } from './model.ts';
import { assertClosed, courseProjection, createLoopGuidance, type LoopCheckpoint } from '../guidance/loop-engine.ts';
import { validApproach, type ApproachPlan } from './approach.ts';

export type CourseOutcome = 'active' | 'arrival-pending' | 'finished' | 'stopped';
export type RunCourse = { id: string; name: string; snapshot: CourseSnapshot };
export type GuidanceOptions = { voice: boolean; background: boolean; mode: 'map' | 'focus' };
export const defaultGuidanceOptions: GuidanceOptions = { voice: true, background: true, mode: 'map' };
export type RunGuidanceCheckpoint = GuidanceCheckpoint | LoopCheckpoint;
export type RunGuidance = { course: RunCourse; checkpoint: RunGuidanceCheckpoint; options: GuidanceOptions; state: GuidanceState };
export function createRunGuidance(coordinates: RunCourse['snapshot']['route'], saved?: RunGuidanceCheckpoint, plan?: ApproachPlan) {
  return saved?.version === 1 ? createGuidance(coordinates, saved) : createLoopGuidance(coordinates, saved, plan);
}
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
  // Completed cloud records intentionally carry no executable checkpoint.
  const engine = row.guidance_json ? createRunGuidance(course.snapshot.route, JSON.parse(row.guidance_json)) : createGuidance(course.snapshot.route);
  const options = row.guidance_options_json ? validateGuidanceOptions(JSON.parse(row.guidance_options_json)) : { ...defaultGuidanceOptions };
  return { course, checkpoint: engine.checkpoint(), options, state: engine.snapshot() };
}
export function validateGuidanceOptions(value: GuidanceOptions): GuidanceOptions {
  if (!value || typeof value.voice !== 'boolean' || typeof value.background !== 'boolean' || !['map', 'focus'].includes(value.mode)) throw new RunError('러닝 안내 설정이 올바르지 않아요.');
  return { voice: value.voice, background: value.background, mode: value.mode };
}
export function startReadiness(course: RunCourse, fix: Fix | null, now: number, plan?: ApproachPlan | null) {
  if (!fix || !Number.isFinite(fix.timestamp) || now - fix.timestamp > 5000 || fix.timestamp > now ||
    !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude) || Math.abs(fix.latitude) > 85 || Math.abs(fix.longitude) > 180 ||
    fix.accuracy === null || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > GUIDANCE_LIMITS.accuracy) {
    return { ready: false, distanceM: null, message: '정확한 현재 위치를 확인해 주세요. 정확도 30m 이내의 최신 위치가 필요해요.' };
  }
  try { assertClosed(course.snapshot.route); } catch (error) { return { ready: false, distanceM: null, message: (error as Error).message }; }
  const distanceM = courseProjection(course.snapshot.route, [fix.longitude, fix.latitude]).separation;
  if (distanceM <= GUIDANCE_LIMITS.returnMeters) return { ready: true, distanceM, message: '코스 위에 있어요. 원하는 방향으로 출발해 주세요.' };
  if (plan) {
    try { validApproach(plan, course.snapshot, [fix.longitude, fix.latitude]); return { ready: true, distanceM, message: `보행 도로로 약 ${Math.round(plan.distanceM)}m 이동하면 코스에 합류해요.` }; }
    catch { /* A fresh position needs a fresh path. */ }
  }
  return { ready: false, distanceM, message: `코스까지 직선으로 약 ${Math.round(distanceM)}m예요. 보행 도로 합류 경로를 준비해 주세요.` };
}
