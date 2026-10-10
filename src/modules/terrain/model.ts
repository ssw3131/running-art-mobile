import type { FeatureCollection, LineString } from 'geojson';

export type Coordinate = [number, number];
export type TerrainPoint = { coordinate: Coordinate; distance: number; elevation: number };
export type TerrainSegment = { coordinates: Coordinate[]; grade: number };
export type TerrainProfile = {
  points: TerrainPoint[]; segments: TerrainSegment[]; length: number;
  ascent: number; descent: number; minimum: number; maximum: number; closed: boolean;
};
export type SampledRoute = {
  coordinates: Coordinate[]; distances: number[]; samples: { coordinate: Coordinate; distance: number }[];
  length: number; closed: boolean;
};
export const terrainBands = [
  { label: '완만', range: '3% 미만', color: '#167D9A' },
  { label: '경사 있음', range: '3% 이상~6% 미만', color: '#B96913' },
  { label: '가파름', range: '6% 이상', color: '#974496' },
] as const;
export function terrainBand(grade: number) { return Math.abs(grade) < 3 ? 0 : Math.abs(grade) < 6 ? 1 : 2; }

export function distanceMeters(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180, lat = (b[1] - a[1]) * rad, lng = (b[0] - a[0]) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
const same = (a: Coordinate, b: Coordinate) => a[0] === b[0] && a[1] === b[1];

export function sampleRoute(route: Coordinate[]): SampledRoute {
  if (!Array.isArray(route) || route.length < 2 || route.length > 20000 || route.some(p =>
    !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) >= 180 || Math.abs(p[1]) > 85)) {
    throw new Error('코스 좌표를 확인할 수 없어요.');
  }
  const coordinates = route.filter((p, i) => !i || !same(p, route[i - 1])).map(p => [...p] as Coordinate);
  const distances = [0];
  for (let i = 1; i < coordinates.length; i++) distances.push(distances[i - 1] + distanceMeters(coordinates[i - 1], coordinates[i]));
  const length = distances.at(-1)!;
  if (length < 1) throw new Error('지형을 표시하기에는 코스가 너무 짧아요.');
  const closed = same(coordinates[0], coordinates.at(-1)!);
  const intervals = Math.min(200, Math.max(closed ? 3 : 1, Math.ceil(length / 50)));
  let edge = 1;
  const samples = Array.from({ length: intervals + 1 }, (_, i) => {
    const distance = length * i / intervals;
    while (edge < distances.length - 1 && distances[edge] < distance) edge++;
    const a = coordinates[edge - 1], b = coordinates[edge];
    const fraction = (distance - distances[edge - 1]) / (distances[edge] - distances[edge - 1]);
    const coordinate: Coordinate = i === 0 ? [...coordinates[0]] : i === intervals ? [...coordinates.at(-1)!] :
      [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    return { coordinate, distance };
  });
  return { coordinates, distances, samples, length, closed };
}

export function analyzeTerrain(route: SampledRoute, elevations: number[]): TerrainProfile {
  const count = route.samples.length - (route.closed ? 1 : 0);
  if (elevations.length !== count || elevations.some(n => !Number.isFinite(n) || n < -12000 || n > 10000)) {
    throw new Error('고도 응답이 불완전해요. 다시 시도해 주세요.');
  }
  // Preserve open endpoints; wrap the averaging window at a loop's seam.
  const smoothed = elevations.map((height, i) => !route.closed && (i === 0 || i === count - 1) ? height :
    (elevations[(i + count - 1) % count] + height + elevations[(i + 1) % count]) / 3);
  if (route.closed) smoothed.push(smoothed[0]);
  const points = route.samples.map((p, i) => ({ ...p, elevation: smoothed[i] }));
  let ascent = 0, descent = 0, vertex = 1;
  const segments = points.slice(1).map((p, i) => {
    const a = points[i], delta = p.elevation - a.elevation;
    ascent += Math.max(0, delta); descent += Math.max(0, -delta);
    const coordinates: Coordinate[] = [a.coordinate];
    // Keep every road bend: sampling must not draw shortcuts across blocks.
    while (vertex < route.distances.length && route.distances[vertex] < p.distance) {
      if (route.distances[vertex] > a.distance) coordinates.push(route.coordinates[vertex]);
      vertex++;
    }
    coordinates.push(p.coordinate);
    return { coordinates, grade: delta / (p.distance - a.distance) * 100 };
  });
  return { points, segments, length: route.length, ascent, descent,
    minimum: Math.min(...smoothed), maximum: Math.max(...smoothed), closed: route.closed };
}

export function reverseTerrain(profile: TerrainProfile): TerrainProfile {
  return { ...profile, ascent: profile.descent, descent: profile.ascent,
    points: [...profile.points].reverse().map(p => ({ ...p, distance: profile.length - p.distance })),
    segments: [...profile.segments].reverse().map(s => ({ coordinates: [...s.coordinates].reverse(), grade: -s.grade })) };
}
export function terrainFeatures(profile: TerrainProfile): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: profile.segments.map(s => ({ type: 'Feature',
    properties: { color: terrainBands[terrainBand(s.grade)].color }, geometry: { type: 'LineString', coordinates: s.coordinates } })) };
}
export function nearestTerrainPoint(profile: TerrainProfile, fraction: number) {
  return Math.max(0, Math.min(profile.points.length - 1, Math.round(Math.max(0, Math.min(1, fraction)) * (profile.points.length - 1))));
}

/** Road-aligned arrow, also rendered when the background style has no glyphs. */
export function terrainDirection(profile: TerrainProfile): FeatureCollection<LineString> {
  // Keep the direction arrow away from the origin label, including folded routes.
  const origin = profile.points[0].coordinate;
  const road = profile.segments.reduce((best, segment) =>
    distanceMeters(origin, segment.coordinates.at(-1)!) > distanceMeters(origin, best.coordinates.at(-1)!) ? segment : best).coordinates;
  const b = road.at(-1)!;
  let index = road.length - 2;
  while (index > 0 && distanceMeters(road[index], b) < 1) index--;
  const a = road[index], scale = Math.cos(b[1] * Math.PI / 180);
  const dx = (b[0] - a[0]) * scale, dy = b[1] - a[1], norm = Math.hypot(dx, dy) || 1;
  const ux = dx / norm, uy = dy / norm;
  const project = (forward: number, side: number): Coordinate =>
    [b[0] + (ux * forward - uy * side) / (111195 * scale), b[1] + (uy * forward + ux * side) / 111195];
  const size = Math.max(25, Math.min(100, profile.length / 35));
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: {
    type: 'LineString', coordinates: [project(-size, size / 2), b, project(-size, -size / 2)],
  } }] };
}
