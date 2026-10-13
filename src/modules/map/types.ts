import type { FeatureCollection, LineString } from 'geojson';
import type { Position } from '../location/locate';
import type { Origin } from '../route-engine/types';
import type { RouteOverlay } from '../route-engine/geojson';

export type MapSurfaceProps = {
  styleUrl: string;
  position: Position | null;
  simulationPosition?: [number, number];
  routeOverlay?: RouteOverlay | null;
  showTarget?: boolean;
  routeColors?: { route: string; target: string };
  terrainOverlay?: {
    segments: FeatureCollection<LineString>; direction: FeatureCollection<LineString>;
    origin: [number, number]; selected: [number, number];
  };
  origin?: Origin;
  syntheticRoads?: FeatureCollection<LineString>;
  centerSelection?: {
    target?: { center: Origin; revision: number };
    onMoveStart(): void;
    onMoveEnd(center: Origin | null): void;
    onReady(ready: boolean): void;
  };
};
