import type { FeatureCollection, LineString } from 'geojson';
import type { Position } from '../location/locate';
import type { Origin } from '../route-engine/types';
import type { RouteOverlay } from '../route-engine/geojson';

export type MapSurfaceProps = {
  styleUrl: string;
  position: Position | null;
  simulationPosition?: [number, number];
  routeOverlay?: RouteOverlay | null;
  origin?: Origin;
  syntheticRoads?: FeatureCollection<LineString>;
  centerSelection?: {
    target?: { center: Origin; revision: number };
    onMoveStart(): void;
    onMoveEnd(center: Origin | null): void;
    onReady(ready: boolean): void;
  };
};
