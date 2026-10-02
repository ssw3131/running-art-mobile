export type Coordinate = [number, number];
export const PLAYBACK_SPEEDS = [1, 5, 10, 30] as const;
export type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];
const radians = (degrees: number) => degrees * Math.PI / 180;
const longitudeDelta = (value: number) => ((value + 540) % 360) - 180;

export function prepareRoute(input: readonly Coordinate[]) {
  if (input.length < 2 || input.some(p => p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 85)) {
    throw new Error('시뮬레이션할 경로를 확인할 수 없어요.');
  }
  const points = input.map(p => [...p] as Coordinate), cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const h = Math.sin(radians(b[1] - a[1]) / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(radians(longitudeDelta(b[0] - a[0])) / 2) ** 2;
    cumulative.push(cumulative[i - 1] + 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h))));
  }
  const totalMeters = cumulative[cumulative.length - 1];
  if (totalMeters <= 0) throw new Error('이동할 거리가 없는 코스예요.');
  return { points, cumulative, totalMeters };
}
export type PreparedRoute = ReturnType<typeof prepareRoute>;
export function positionAt(route: PreparedRoute, meters: number): Coordinate {
  const distance = Math.max(0, Math.min(route.totalMeters, meters));
  if (distance === 0) return [...route.points[0]];
  if (distance === route.totalMeters) return [...route.points[route.points.length - 1]];
  let low = 1, high = route.cumulative.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (route.cumulative[middle] <= distance) low = middle + 1; else high = middle;
  }
  const a = route.points[low - 1], b = route.points[low];
  const ratio = (distance - route.cumulative[low - 1]) / (route.cumulative[low] - route.cumulative[low - 1]);
  return [longitudeDelta(a[0] + longitudeDelta(b[0] - a[0]) * ratio), a[1] + (b[1] - a[1]) * ratio];
}

// Monotonic elapsed time, not frame count. Base pace is 6 minutes per kilometer.
export function createPlayer(route: PreparedRoute, now: () => number) {
  let meters = 0, speed: PlaybackSpeed = 1, playing = false, last = 0;
  function snapshot() {
    return { meters, totalMeters: route.totalMeters, progress: meters / route.totalMeters, speed, playing, finished: meters >= route.totalMeters, position: positionAt(route, meters) };
  }
  function sample() {
    const time = now();
    if (playing) meters = Math.min(route.totalMeters, meters + Math.max(0, time - last) / 1000 * (1000 / 360) * speed);
    last = time;
    if (meters >= route.totalMeters) playing = false;
    return snapshot();
  }
  return {
    sample,
    snapshot,
    play() { sample(); if (meters < route.totalMeters) playing = true; return sample(); },
    pause() { sample(); playing = false; return sample(); },
    restart() { meters = 0; playing = false; last = now(); return sample(); },
    setSpeed(value: PlaybackSpeed) {
      if (!PLAYBACK_SPEEDS.includes(value)) throw new Error('지원하지 않는 재생 속도예요.');
      sample(); speed = value; return sample();
    },
  };
}
