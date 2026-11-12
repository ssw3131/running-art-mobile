import type { RunPoint } from './model.ts';
import type { FeatureCollection, LineString, Point } from 'geojson';

export function recordedPaths(points: readonly RunPoint[]): [number, number][][] {
  const paths: [number, number][][] = [];
  let segment: number | undefined;
  for (const point of points) {
    if (point.segment !== segment) { paths.push([]); segment = point.segment; }
    paths.at(-1)!.push([point.longitude, point.latitude]);
  }
  return paths;
}

/** One source preserves guide/trail layer order, including style reloads.
 * Isolated accepted fixes remain visible without joining GPS gaps. */
export function routeTrailData(route: readonly number[][], paths: readonly number[][][]): FeatureCollection<LineString | Point> {
  return { type: 'FeatureCollection', features: [
    ...(route.length >= 2 ? [{ type: 'Feature' as const, properties: { role: 'course' }, geometry: { type: 'LineString' as const, coordinates: [...route] } }] : []),
    ...paths.filter(path => path.length).map(path => ({ type: 'Feature' as const, properties: { role: 'trace' },
      geometry: path.length === 1 ? { type: 'Point' as const, coordinates: path[0] } : { type: 'LineString' as const, coordinates: path } })),
  ] };
}
