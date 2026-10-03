import { bearing, offset, positionAt, prepareRoute, type Coordinate } from './geometry.ts';
import type { GuidanceFix } from './engine.ts';

export const SCENARIOS = [
  { id: 'normal', name: '정상 완주' }, { id: 'turns', name: '회전·유턴' }, { id: 'detour', name: '이탈 후 복귀' },
  { id: 'jitter', name: '위치 흔들림' }, { id: 'loss', name: '신호 끊김' }, { id: 'crossing', name: '교차 코스' },
  { id: 'overlap', name: '왕복·겹침' }, { id: 'long', name: '화면 꺼짐 · 36분' },
] as const;
export type Scenario = typeof SCENARIOS[number]['id'];
export type SimulationCommand = 'depart' | 'return' | 'weak' | 'lost' | 'normal';
const origin: Coordinate = [127, 37];
export function demoCourse(scenario: Scenario): Coordinate[] {
  const meters: Coordinate[] = scenario === 'crossing' ? [[0, 0], [180, 180], [0, 180], [180, 0], [0, 0]]
    : scenario === 'overlap' || scenario === 'turns' ? [[0, 0], [0, 220], [180, 220], [180, 100], [180, 220], [0, 220], [0, 0]]
    : scenario === 'long' ? [[0, 0], [0, 1600], [1000, 1600], [1000, 0], [0, 0], [0, 800]]
    : [[0, 0], [0, 240], [220, 240], [220, 100], [380, 100], [380, 400]];
  return meters.map(p => offset(origin, p[0], p[1]));
}
// This source knows the scripted path; the guidance engine only sees Fix values.
export function createSimulator(points: readonly Coordinate[], scenario: Scenario) {
  const route = prepareRoute(points);
  let cursor = 0, elapsed = 0, detourM = 0, detour: ReturnType<typeof prepareRoute> | null = null;
  let mode: 'route' | 'depart' | 'return' = 'route', quality: 'normal' | 'weak' | 'lost' = 'normal';
  let autoDeparted = false, autoReturned = false;
  function command(value: SimulationCommand) {
    if (value === 'depart' && mode === 'route') {
      const start = positionAt(route, cursor), heading = bearing(start, positionAt(route, Math.min(route.totalMeters, cursor + 10))) * Math.PI / 180;
      const right = (m: number, forward: number) => offset(start, Math.cos(heading) * m + Math.sin(heading) * forward, -Math.sin(heading) * m + Math.cos(heading) * forward);
      detour = prepareRoute([start, right(45, 0), right(45, 40), right(90, 40)]);
      detourM = 0; dwell = 0; mode = 'depart';
    } else if (value === 'return' && detour) mode = 'return';
    else if (value === 'weak' || value === 'lost' || value === 'normal') quality = value;
  }
  function sample(): GuidanceFix | null {
    const lost = quality === 'lost' || (scenario === 'loss' && elapsed >= 30000 && elapsed < 40000);
    if (lost) return null;
    let p = mode !== 'route' && detour ? positionAt(detour, detourM) : positionAt(route, cursor);
    if (scenario === 'jitter') p = offset(p, 6 * Math.sin(elapsed / 1700), 4 * Math.cos(elapsed / 2100));
    return { position: p, timestamp: elapsed, accuracy: quality === 'weak' ? 80 : scenario === 'jitter' ? 12 : 5 };
  }
  function step(ms = 1000) {
    elapsed += ms;
    if ((scenario === 'detour' || scenario === 'long') && !autoDeparted && cursor >= 120) { command('depart'); autoDeparted = true; }
    if ((scenario === 'detour' || scenario === 'long') && mode === 'depart' && detourM >= 85 && !autoReturned) { command('return'); autoReturned = true; }
    const advance = ms / 360;
    if (mode === 'depart' && detour) detourM = Math.min(detour.totalMeters, detourM + advance);
    else if (mode === 'return') {
      detourM = Math.max(0, detourM - advance);
      // Stay at the anchor for the recovery confirmation interval.
      if (detourM === 0) { dwell += ms; if (dwell >= 5000) { mode = 'route'; detour = null; } }
    } else cursor = Math.min(route.totalMeters, cursor + advance);
    return sample();
  }
  let dwell = 0;
  return { step, sample, command, elapsed: () => elapsed };
}
