import type { Feature, LineString } from 'geojson';
import { toLatLng } from './engine.ts';
import type { Candidate, Origin, Point } from './types.ts';

export type RouteOverlay = {
  route: Feature<LineString>;
  target: Feature<LineString>;
  start: [number, number];
  bounds: [number, number, number, number];
};

export function candidateOverlay(candidate: Candidate, origin: Origin): RouteOverlay {
  const coordinates = (points: Point[]): [number, number][] => points.map((point) => {
    const [lat, lng] = toLatLng(point, origin);
    return [lng, lat];
  });
  const route = coordinates(candidate.route);
  const target = coordinates(candidate.target);
  const all = [...route, ...target];
  const feature = (points: [number, number][]): Feature<LineString> => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points } });
  return {
    route: feature(route), target: feature(target), start: route[0],
    bounds: [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))],
  };
}
