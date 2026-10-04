import type { Run, RunPoint } from '../running/model.ts';
import type { RunCourse } from '../running/guidance.ts';

export type Position = [number, number];
export type SharedRun = { schemaVersion: 1; title: string; distanceM: number; activeMs: number; segments: Position[][]; planned: { route: Position[]; target: Position[] } | null };
export const SHARE_MAX_POINTS = 100000;
export const SHARE_MAX_BYTES = 8 * 1024 * 1024;
export class RunShareError extends Error {}
export function shareErrorMessage(error: unknown) {
  return error instanceof RunShareError ? error.message : '공유 상태를 확인하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
}
export function validToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
export function shareBase(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}
export function shareUrl(base: string, token: string) {
  const origin = shareBase(base);
  if (!origin || !validToken(token)) throw new RunShareError('공유 주소를 확인하지 못했어요.');
  const url = new URL(origin);
  // Fragment capabilities are not sent to the web host, logs, or map requests.
  url.hash = `r/${token}`;
  return url.href;
}
export function validateSharedRun(value: unknown): SharedRun {
  const fail = (): never => { throw new RunShareError('공유할 경로 데이터를 확인하지 못했어요.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const v = value as SharedRun;
  if (Object.keys(v).sort().join(',') !== 'activeMs,distanceM,planned,schemaVersion,segments,title' || v.schemaVersion !== 1 ||
      typeof v.title !== 'string' || !v.title.trim() || v.title.length > 80 ||
      typeof v.distanceM !== 'number' || !Number.isFinite(v.distanceM) || v.distanceM < 0 || v.distanceM > 10000000 ||
      !Number.isSafeInteger(v.activeMs) || v.activeMs < 0 || v.activeMs > 31536000000 ||
      !Array.isArray(v.segments) || !v.segments.length || v.segments.length > SHARE_MAX_POINTS) return fail();
  let count = 0, line = false;
  const coordinate = (p: Position): Position => {
    if (!Array.isArray(p) || p.length !== 2 || p.some(c => typeof c !== 'number' || !Number.isFinite(c)) ||
        Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) return fail();
    return [p[0], p[1]];
  };
  const segments = v.segments.map(segment => {
    if (!Array.isArray(segment) || !segment.length || (count += segment.length) > SHARE_MAX_POINTS) return fail();
    if (segment.length > 1) line = true;
    return segment.map(coordinate);
  });
  if (!line) throw new RunShareError('공유할 수 있는 GPS 경로가 아직 없어요.');
  let planned: SharedRun['planned'] = null;
  if (v.planned !== null) {
    if (!v.planned || typeof v.planned !== 'object' || Object.keys(v.planned).sort().join(',') !== 'route,target') return fail();
    const path = (p: Position[]) => {
      if (!Array.isArray(p) || p.length < 2 || p.length > 20000) return fail();
      return p.map(coordinate);
    };
    planned = { route: path(v.planned.route), target: path(v.planned.target) };
  }
  const result: SharedRun = { schemaVersion: 1, title: v.title, distanceM: v.distanceM, activeMs: v.activeMs, segments, planned };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > SHARE_MAX_BYTES) throw new RunShareError('경로가 공유 가능한 크기를 넘었어요. 원본 기록은 유지됩니다.');
  return result;
}
export function makeSharedRun(run: Run, points: RunPoint[], course: RunCourse | null = null): SharedRun {
  if (run.status !== 'completed') throw new RunShareError('러닝을 종료한 뒤 경로를 공유해 주세요.');
  if (points.length !== run.pointCount || points.length > SHARE_MAX_POINTS) throw new RunShareError('저장된 GPS 경로를 다시 확인해 주세요.');
  const segments: Position[][] = [];
  let last: RunPoint | undefined;
  for (const point of points) {
    if (!Number.isSafeInteger(point.segment) || point.segment < 0 || point.sequence !== (last?.sequence ?? 0) + 1 ||
        !Number.isSafeInteger(point.timestamp) || (last && (point.segment < last.segment || point.timestamp <= last.timestamp))) {
      throw new RunShareError('저장된 GPS 순서를 확인하지 못했어요.');
    }
    if (!last || point.segment !== last.segment) segments.push([]);
    segments[segments.length - 1].push([point.longitude, point.latitude]);
    last = point;
  }
  if (run.courseId && (!course || run.courseId !== course.id)) throw new RunShareError('출발 당시의 코스 정보를 확인하지 못했어요.');
  return validateSharedRun({ schemaVersion: 1, title: run.courseName?.trim() || '나의 러닝 경로', distanceM: run.distanceM, activeMs: run.activeMs, segments,
    planned: course ? { route: course.snapshot.route, target: course.snapshot.target } : null });
}
