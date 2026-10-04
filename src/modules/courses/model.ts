import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { strToU8 } from 'fflate';
import type { Origin, ShapeId, RoadSegmentRef, Point } from '../route-engine/types.ts';
import { validateCustomTemplate } from '../route-engine/engine.ts';
import type { RouteOverlay } from '../route-engine/geojson.ts';

export const COURSE_NAME_MAX = 80;
export const COURSE_JSON_MAX = 2 * 1024 * 1024;
export const COURSE_POINTS_MAX = 20000;
export const courseShapes: Record<ShapeId, string> = {
  heart: '하트', star: '별', cat: '고양이', rabbit: '토끼', house: '집', diamond: '다이아몬드', bolt: '번개', fish: '물고기', arrow: '화살표', custom: '직접 그린 도형',
};
export type CourseSnapshot = {
  schemaVersion: 1 | 2 | 3; engineVersion: '0.2'; source: 'osm' | 'synthetic'; shape: ShapeId;
  customTemplate?: Point[];
  roadSegments?: RoadSegmentRef[];
  origin: Origin; targetKm: number; lengthKm: number; score: number;
  route: [number, number][]; target: [number, number][];
};
export type CourseSummary = {
  id: string; name: string; source: CourseSnapshot['source']; shape: ShapeId;
  targetKm: number; lengthKm: number; score: number; createdAt: number; updatedAt: number;
};
export type SavedCourse = CourseSummary & { snapshot: CourseSnapshot };
export class CourseError extends Error {
  readonly code: 'validation' | 'missing' | 'corrupt' | 'newer-format';
  constructor(code: CourseError['code'], message: string) {
    super(message); this.name = 'CourseError'; this.code = code;
  }
}
export function courseErrorMessage(error: unknown) {
  return error instanceof CourseError ? error.message : '코스 저장소를 확인하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.';
}
export function courseName(value: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > COURSE_NAME_MAX || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new CourseError('validation', `코스 이름을 1~${COURSE_NAME_MAX}자로 입력해 주세요.`);
  }
  return value.trim();
}
export function courseId(id: string) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new CourseError('missing', '저장한 코스를 찾지 못했어요. 목록에서 다시 선택해 주세요.');
  return id;
}
const numeric = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function validateSnapshot(value: unknown): CourseSnapshot {
  const fail = () => { throw new CourseError('validation', '코스 경로와 계산 정보를 확인할 수 없어요. 다시 계산해 주세요.'); };
  if (!value || typeof value !== 'object') return fail();
  const data = value as CourseSnapshot;
  if (Number.isInteger(data.schemaVersion) && data.schemaVersion > 3) throw new CourseError('newer-format', '더 최신 형식의 코스예요. 앱을 업데이트해 주세요.');
  if (![1, 2, 3].includes(data.schemaVersion) || data.engineVersion !== '0.2' || !['osm', 'synthetic'].includes(data.source) ||
    !Object.hasOwn(courseShapes, data.shape) || !data.origin || !numeric(data.origin.lat, -85, 85) || !numeric(data.origin.lng, -180, 180) ||
    !numeric(data.targetKm, 0.001, 1000) || !numeric(data.lengthKm, 0.001, 1000) || !numeric(data.score, 0, 100)) return fail();
  let customTemplate: Point[] | undefined;
  if (data.schemaVersion === 3) {
    if (data.shape !== 'custom') return fail();
    try { customTemplate = validateCustomTemplate(data.customTemplate!); } catch { return fail(); }
  } else if (data.shape === 'custom' || data.customTemplate !== undefined) return fail();
  const coordinates = (points: unknown): [number, number][] => {
    if (!Array.isArray(points) || points.length < 2 || points.length > COURSE_POINTS_MAX) return fail();
    return points.map(p => {
      if (!Array.isArray(p) || p.length !== 2 || !numeric(p[0], -180, 180) || !numeric(p[1], -85, 85)) return fail();
      return [p[0], p[1]];
    });
  };
  const route = coordinates(data.route);
  let roadSegments: RoadSegmentRef[] | undefined;
  if (data.schemaVersion === 2 || (data.schemaVersion === 3 && data.source === 'osm')) {
    if (route[0][0] !== route.at(-1)![0] || route[0][1] !== route.at(-1)![1] || !Array.isArray(data.roadSegments) || data.roadSegments.length !== route.length - 1) return fail();
    roadSegments = data.roadSegments.map(r => {
      if (!r || ![r.way, r.from, r.to].every(n => Number.isSafeInteger(n) && n > 0) || r.from === r.to ||
        !numeric(r.start, 0, 1) || !numeric(r.end, 0, 1) || r.start === r.end || r.bidirectional !== true) return fail();
      return { way: r.way, from: r.from, to: r.to, start: r.start, end: r.end, bidirectional: true };
    });
  }
  // Normalize key order and copy all caller-owned arrays before any async write.
  return { schemaVersion: data.schemaVersion, engineVersion: '0.2', source: data.source, shape: data.shape,
    origin: { lat: data.origin.lat, lng: data.origin.lng }, targetKm: data.targetKm, lengthKm: data.lengthKm, score: data.score,
    route, target: coordinates(data.target), ...(roadSegments ? { roadSegments } : {}), ...(customTemplate ? { customTemplate } : {}) };
}
export function encodeSnapshot(value: unknown) {
  const snapshot = validateSnapshot(value), json = JSON.stringify(snapshot);
  if (json.length > COURSE_JSON_MAX) throw new CourseError('validation', '저장할 코스가 너무 커요. 더 짧은 코스로 다시 계산해 주세요.');
  return { snapshot, json, hash: bytesToHex(sha256(strToU8(json))) };
}
export function decodeSnapshot(json: string, hash: string) {
  try {
    if (typeof json !== 'string' || json.length > COURSE_JSON_MAX || bytesToHex(sha256(strToU8(json))) !== hash) throw new Error('hash mismatch');
    return validateSnapshot(JSON.parse(json));
  } catch (error) {
    if (error instanceof CourseError && error.code === 'newer-format') throw error;
    throw new CourseError('corrupt', '저장한 코스 자료가 손상됐어요. 다른 코스를 열거나 이 코스를 삭제해 주세요.');
  }
}
export function savedCourseOverlay(snapshot: CourseSnapshot): RouteOverlay {
  const data = validateSnapshot(snapshot);
  const bounds: RouteOverlay['bounds'] = [180, 85, -180, -85];
  for (const [lng, lat] of [...data.route, ...data.target]) {
    bounds[0] = Math.min(bounds[0], lng); bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lng); bounds[3] = Math.max(bounds[3], lat);
  }
  return { route: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: data.route } },
    target: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: data.target } }, start: data.route[0], freeStart: true, bounds };
}
