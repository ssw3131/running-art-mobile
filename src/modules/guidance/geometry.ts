import { prepareRoute, positionAt, type Coordinate, type PreparedRoute } from '../course-simulation/player.ts';
export { prepareRoute, positionAt };
export type { Coordinate, PreparedRoute };
const R = 6371000, RAD = Math.PI / 180;
export const distance = (a: Coordinate, b: Coordinate) => {
  const h = Math.sin((b[1] - a[1]) * RAD / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin((b[0] - a[0]) * RAD / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
};
export function offset(a: Coordinate, east: number, north: number): Coordinate {
  return [a[0] + east / (R * RAD * Math.cos(a[1] * RAD)), a[1] + north / (R * RAD)];
}
export function bearing(a: Coordinate, b: Coordinate) {
  return Math.atan2(Math.sin((b[0] - a[0]) * RAD) * Math.cos(b[1] * RAD), Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) - Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos((b[0] - a[0]) * RAD)) / RAD;
}
export const angle = (value: number) => ((value + 540) % 360) - 180;
export function segmentAt(route: PreparedRoute, meters: number) {
  let lo = 0, hi = route.points.length - 2;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (route.cumulative[mid] <= meters) lo = mid; else hi = mid - 1; }
  return lo;
}
export function project(route: PreparedRoute, point: Coordinate, start: number, end: number, expected: number) {
  const low = Math.max(0, start), high = Math.min(route.totalMeters, end);
  let best = { meters: low, position: positionAt(route, low), separation: Infinity, segment: segmentAt(route, low), score: Infinity };
  const cos = Math.cos(point[1] * RAD);
  for (let i = segmentAt(route, low); i < route.points.length - 1 && route.cumulative[i] <= high; i++) {
    const span = route.cumulative[i + 1] - route.cumulative[i];
    if (span < 0.0001) continue;
    const a = route.points[i], b = route.points[i + 1];
    const ax = angle(a[0] - point[0]) * cos * R * RAD, ay = (a[1] - point[1]) * R * RAD;
    const dx = angle(b[0] - a[0]) * cos * R * RAD, dy = (b[1] - a[1]) * R * RAD;
    const t = Math.max(Math.max(0, (low - route.cumulative[i]) / span), Math.min(Math.min(1, (high - route.cumulative[i]) / span), -(ax * dx + ay * dy) / (dx * dx + dy * dy)));
    const meters = route.cumulative[i] + t * span, separation = Math.hypot(ax + t * dx, ay + t * dy);
    const score = separation + Math.abs(meters - expected) * 0.015;
    if (score < best.score) best = { meters, position: positionAt(route, meters), separation, segment: i, score };
  }
  return best;
}
export type Turn = { id: string; meters: number; kind: 'left' | 'right' | 'uturn'; label: string };
export function turnsFor(route: PreparedRoute): Turn[] {
  const turns: Turn[] = [];
  for (let i = 1; i < route.points.length - 1; i++) {
    const m = route.cumulative[i];
    if (m < 5 || route.totalMeters - m < 5 || m === route.cumulative[i - 1]) continue;
    const delta = angle(bearing(route.points[i], positionAt(route, Math.min(route.totalMeters, m + 10))) - bearing(positionAt(route, Math.max(0, m - 10)), route.points[i]));
    if (Math.abs(delta) < 35) continue;
    const kind = Math.abs(delta) >= 150 ? 'uturn' : delta > 0 ? 'right' : 'left';
    const turn: Turn = { id: `turn-${i}`, meters: m, kind, label: kind === 'uturn' ? '뒤로 돌아가세요' : kind === 'left' ? '좌회전하세요' : '우회전하세요' };
    if (!turns.length || m - turns[turns.length - 1].meters >= 20) turns.push(turn);
  }
  return turns;
}
