import { angle, bearing, distance, positionAt, prepareRoute, project, turnsFor, type Coordinate } from './geometry.ts';

export const GUIDANCE_LIMITS = { offMeters: 25, offMs: 5000, returnMeters: 12, returnMs: 3000, accuracy: 30, gapMs: 5000, finishRemaining: 10, finishRadius: 15, finishMs: 3000 } as const;
export type GuidanceFix = { position: Coordinate; timestamp: number; accuracy: number };
export type GuidanceEvent = { id: string; kind: 'turn' | 'off-route' | 'returned' | 'arrival'; text: string; timestamp: number; vibrate: boolean };
export type GuidanceState = {
  phase?: 'approach' | 'direction' | 'lap' | 'return' | 'arrived' | 'continued';
  lapStart?: Coordinate | null; navigationError?: string | null;
  status: 'normal' | 'off-route' | 'weak' | 'arrived'; position: Coordinate; progressM: number; totalM: number;
  distanceM: number; remainingM: number; returnM: number; returnPath: Coordinate[]; trace: Coordinate[][];
  direction: 'straight' | 'left' | 'right' | 'uturn' | 'arrival' | 'unknown'; instruction: string; instructionM: number;
  separationM: number; elapsedMs: number; events: GuidanceEvent[];
};
export type GuidanceCheckpoint = {
  version: 1; progress: number; traveled: number; last: GuidanceFix | null; lastAccepted: GuidanceFix | null;
  now: number; lastInput: number; offSince: number | null; returnSince: number | null; finishSince: number | null;
  off: boolean; weak: boolean; arrived: boolean; separation: number; episode: number; anchor: number; continuous: boolean;
  heading: number | null; breadcrumbs: Coordinate[]; emitted: string[]; current: Coordinate;
  rejoin: boolean; arrivalSuppressedAt: Coordinate | null;
};
export function createGuidance(coordinates: readonly Coordinate[], saved?: GuidanceCheckpoint) {
  const route = prepareRoute(coordinates), turns = turnsFor(route);
  let progress = 0, traveled = 0, last: GuidanceFix | null = null, lastAccepted: GuidanceFix | null = null;
  let now = 0, lastInput = -1, offSince: number | null = null, returnSince: number | null = null, finishSince: number | null = null;
  let off = false, weak = false, arrived = false, separation = 0, episode = 0, anchor = 0, continuous = true;
  let heading: number | null = null;
  let breadcrumbs: Coordinate[] = [], trace: Coordinate[][] = [[]], events: GuidanceEvent[] = [];
  const emitted = new Set<string>();
  let current = [...route.points[0]] as Coordinate;
  let rejoin = false, arrivalSuppressedAt: Coordinate | null = null;
  if (saved) {
    if (saved.version !== 1 || !Number.isFinite(saved.progress) || saved.progress < 0 || saved.progress > route.totalMeters + 0.01 ||
      !Number.isFinite(saved.now) || !Array.isArray(saved.breadcrumbs) || !Array.isArray(saved.emitted) ||
      !Array.isArray(saved.current) || saved.current.length !== 2 || !saved.current.every(Number.isFinite)) throw new Error('안내 복원 상태를 확인할 수 없어요.');
    // Copy persisted state: the caller can retain it for transaction rollback.
    const s: GuidanceCheckpoint = JSON.parse(JSON.stringify(saved));
    ({ progress, traveled, last, lastAccepted, now, lastInput, offSince, returnSince, finishSince, off, weak, arrived,
      separation, episode, anchor, continuous, heading, breadcrumbs, current, rejoin, arrivalSuppressedAt } = s);
    for (const id of s.emitted) emitted.add(id);
  }
  function checkpoint(): GuidanceCheckpoint {
    return JSON.parse(JSON.stringify({ version: 1, progress, traveled, last, lastAccepted, now, lastInput, offSince, returnSince,
      finishSince, off, weak, arrived, separation, episode, anchor, continuous, heading, breadcrumbs, emitted: [...emitted], current,
      rejoin, arrivalSuppressedAt }));
  }
  function resume() {
    if (arrived) { arrived = false; arrivalSuppressedAt = [...current]; emitted.delete('arrival'); }
    last = null; lastAccepted = null; heading = null; finishSince = null; offSince = null; returnSince = null;
    rejoin = true; weak = true; continuous = false;
    anchor = progress;
    return snapshot();
  }
  function emit(kind: GuidanceEvent['kind'], id: string, text: string) {
    if (emitted.has(id)) return;
    emitted.add(id); events.push({ id, kind, text, timestamp: now, vibrate: kind === 'off-route' });
    events = events.slice(-100);
  }
  function instruction() {
    if (arrived) return { direction: 'arrival' as const, instruction: '코스를 완주했어요!', instructionM: 0 };
    if (weak || (off && !continuous)) return { direction: 'unknown' as const, instruction: '위치 확인 중', instructionM: 0 };
    if (off) {
      const target = breadcrumbs.at(-2) ?? positionAt(route, anchor);
      const delta = heading === null ? 0 : angle(bearing(current, target) - heading);
      const direction = heading === null ? 'unknown' : Math.abs(delta) > 135 ? 'uturn' : delta > 35 ? 'right' : delta < -35 ? 'left' : 'straight';
      return { direction: direction as GuidanceState['direction'], instruction: '지나온 길로 돌아가세요', instructionM: returnDistance() };
    }
    const next = turns.find(t => t.meters > progress + 3);
    return next ? { direction: next.kind, instruction: next.label, instructionM: Math.max(0, next.meters - progress) }
      : { direction: 'straight' as const, instruction: '코스를 따라 달리세요', instructionM: Math.max(0, route.totalMeters - progress) };
  }
  function returnDistance() {
    if (!off || !continuous) return 0;
    return breadcrumbs.slice(1).reduce((sum, p, i) => sum + distance(breadcrumbs[i], p), 0);
  }
  function snapshot(): GuidanceState {
    const back = returnDistance();
    return { status: arrived ? 'arrived' : weak || (off && !continuous) ? 'weak' : off ? 'off-route' : 'normal', position: current,
      progressM: progress, totalM: route.totalMeters, distanceM: traveled, remainingM: Math.max(0, route.totalMeters - progress) + back,
      returnM: back, returnPath: off && continuous ? [...breadcrumbs].reverse() : [], trace, ...instruction(), separationM: separation, elapsedMs: now, events };
  }
  function tick(timestamp: number) {
    now = Math.max(now, timestamp);
    if (!arrived && (!last || now - last.timestamp > GUIDANCE_LIMITS.gapMs)) { weak = true; finishSince = null; offSince = null; returnSince = null; }
    return snapshot();
  }
  function ingest(fix: GuidanceFix) {
    if (arrived || !Number.isFinite(fix.timestamp) || fix.timestamp <= lastInput || fix.timestamp < now) return snapshot();
    now = fix.timestamp; lastInput = fix.timestamp;
    if (!Array.isArray(fix.position) || fix.position.length !== 2 || !fix.position.every(Number.isFinite) || Math.abs(fix.position[0]) > 180 || Math.abs(fix.position[1]) > 85 || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > GUIDANCE_LIMITS.accuracy) {
      weak = true; last = null; offSince = null; returnSince = null; finishSince = null; if (off || breadcrumbs.length) continuous = false; return snapshot();
    }
    const previous = last;
    const gap = !previous || now - previous.timestamp > GUIDANCE_LIMITS.gapMs;
    if (gap) { offSince = null; returnSince = null; finishSince = null; }
    const step = previous ? distance(previous.position, fix.position) : 0;
    if (previous && !gap && step / ((now - previous.timestamp) / 1000) > 12) { weak = true; last = null; finishSince = null; if (off || breadcrumbs.length) continuous = false; return snapshot(); }
    const previousAccepted = lastAccepted;
    lastAccepted = fix; last = fix; weak = false; current = [...fix.position];
    if (gap) heading = null;
    else if (step >= 0.5) heading = bearing(previous!.position, current);
    if (gap) { if (trace.at(-1)!.length) trace.push([]); if (off || breadcrumbs.length) continuous = false; }
    else if (step >= 0.5) traveled += step;
    const tail = trace.at(-1)!;
    if (!tail.length || distance(tail.at(-1)!, current) >= 2) {
      // Bound presentation history; this is an ephemeral simulation, never a user record.
      tail.push(current); if (tail.length > 20000) tail.splice(0, 1000);
    }
    if (arrivalSuppressedAt && distance(arrivalSuppressedAt, current) >= 5) arrivalSuppressedAt = null;
    if (rejoin) {
      separation = distance(current, positionAt(route, anchor));
      if (separation <= GUIDANCE_LIMITS.returnMeters) {
        rejoin = false; off = false; continuous = true; breadcrumbs = [positionAt(route, anchor)];
      } else {
        off = true; continuous = false;
        return snapshot();
      }
    }
    const maxAdvance = gap ? Math.min(200, Math.max(20, previousAccepted ? (now - previousAccepted.timestamp) / 1000 * 6 : 20)) : Math.max(15, step * 1.5 + 6);
    const matched = project(route, current, Math.max(0, progress - 15), progress + maxAdvance, progress + (gap ? 0 : step));
    separation = matched.separation;
    if (!off) {
      if (separation <= GUIDANCE_LIMITS.returnMeters) {
        progress = Math.max(progress, matched.meters); anchor = progress;
        breadcrumbs = [positionAt(route, progress)]; continuous = true; offSince = null;
      } else {
        if (continuous && (!breadcrumbs.length || distance(breadcrumbs.at(-1)!, current) >= 1)) breadcrumbs.push(current);
        if (separation > GUIDANCE_LIMITS.offMeters) {
          offSince ??= now;
          if (now - offSince >= GUIDANCE_LIMITS.offMs) { off = true; episode++; emit('off-route', `off-${episode}`, '코스를 벗어났어요. 지나온 길로 돌아가세요.'); }
        } else offSince = null;
      }
    } else {
      if (continuous) {
        // Retracing pops the breadcrumb stack; no shortcut to a different course occurrence.
        while (breadcrumbs.length > 1 && distance(current, breadcrumbs.at(-2)!) <= 4) breadcrumbs.pop();
        if (!breadcrumbs.length || distance(breadcrumbs.at(-1)!, current) >= 2) breadcrumbs.push(current);
      }
      const toAnchor = distance(current, positionAt(route, anchor));
      if (toAnchor <= GUIDANCE_LIMITS.returnMeters) {
        returnSince ??= now;
        if (now - returnSince >= GUIDANCE_LIMITS.returnMs) {
          off = false; continuous = true; offSince = null; returnSince = null;
          progress = anchor; breadcrumbs = [positionAt(route, anchor)];
          emit('returned', `returned-${episode}`, '코스로 돌아왔어요. 코스를 따라 달려보세요.');
        }
      } else returnSince = null;
    }
    if (!off && !weak) {
      const next = turns.find(t => t.meters > progress + 3);
      if (next && next.meters - progress <= 100) {
        const threshold = next.meters - progress <= 30 ? 30 : 100;
        if (threshold === 30) emitted.add(`${next.id}-100`);
        emit('turn', `${next.id}-${threshold}`, `약 ${Math.max(5, Math.round((next.meters - progress) / 5) * 5)}미터 앞에서 ${next.label}`);
      }
      const lastSegment = route.cumulative.findLastIndex((v, i) => i < route.points.length - 1 && route.cumulative[i + 1] > v);
      const eligible = !arrivalSuppressedAt && progress >= route.cumulative[Math.max(0, lastSegment)] && progress >= route.totalMeters - GUIDANCE_LIMITS.finishRemaining && distance(current, route.points.at(-1)!) <= GUIDANCE_LIMITS.finishRadius;
      if (eligible) {
        finishSince ??= now;
        if (now - finishSince >= GUIDANCE_LIMITS.finishMs) { arrived = true; progress = route.totalMeters; emit('arrival', 'arrival', '코스를 완주했어요. 완주 결과를 확인해 주세요.'); }
      } else finishSince = null;
    } else finishSince = null;
    return snapshot();
  }
  return { ingest, tick, snapshot, route, turns, checkpoint, resume };
}
