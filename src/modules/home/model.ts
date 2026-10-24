import type { Run } from '../running/model.ts';
import type { CourseSummary } from '../courses/model.ts';
import { fromByteArray } from 'base64-js';

export type HomePath = [number, number][];
export type HomeRun = { run: Run; paths: HomePath[] };
export type HomeCourse = { course: CourseSummary; paths: HomePath[]; previewError: boolean };
export type HomeData = {
  owner: string; monthStart: number; monthEnd: number; monthlyDistanceM: number; runCount: number;
  recent: HomeRun[]; latestCompleted: Run | null; courseCount: number; courses: HomeCourse[];
  currentStreak: number;
};
export type HomeKind = 'initial' | 'history';
export const homeKind = (data: HomeData): HomeKind => data.runCount > 0 || data.courseCount > 0 ? 'history' : 'initial';
export const homeRunOutcome = (run: Run) => !run.courseId ? null : run.courseOutcome === 'finished' ? '완주' : '미완주';

/** Device calendar, assigned to the session's start date (including midnight crossings). */
export function homeMonth(now: number) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid home date');
  return { start: new Date(date.getFullYear(), date.getMonth(), 1).getTime(), end: new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime() };
}

export function courseProgress(progressM: number, totalM: number) {
  return Number.isFinite(progressM) && Number.isFinite(totalM) && totalM > 0
    ? Math.min(100, Math.max(0, Math.floor(progressM / totalM * 100))) : null;
}

/** A local coordinate preview; never connects separate GPS segments. */
export function homePathSvg(paths: HomePath[], color: string) {
  const points = paths.flat().filter(p => p.every(Number.isFinite));
  if (!points.length) return null;
  const latitude = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const ratio = Math.cos(latitude * Math.PI / 180);
  const bounds = points.reduce((b, p) => ({ minX: Math.min(b.minX, p[0] * ratio), maxX: Math.max(b.maxX, p[0] * ratio), minY: Math.min(b.minY, -p[1]), maxY: Math.max(b.maxY, -p[1]) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const { minX, minY } = bounds, width = bounds.maxX - minX, height = bounds.maxY - minY;
  const scale = 168 / Math.max(width, height, 0.00001);
  const xy = (p: [number, number]) => [(p[0] * ratio - minX - width / 2) * scale + 100, (-p[1] - minY - height / 2) * scale + 100];
  const lines = paths.map(path => path.filter(p => p.every(Number.isFinite))).filter(path => path.length).map(path => {
    const p = xy(path[0]);
    return `<polyline points="${path.map(point => xy(point).map(v => v.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${color}"/>`;
  }).join('');
  // expo-image's Android data-URL loader decodes all data URLs as Base64.
  // This SVG contains only ASCII numeric coordinates and theme colors.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">${lines}</svg>`;
  return `data:image/svg+xml;base64,${fromByteArray(Uint8Array.from(svg, char => char.charCodeAt(0)))}`;
}
