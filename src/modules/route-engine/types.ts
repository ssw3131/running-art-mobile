export type Point = { x: number; y: number };
export type Origin = { lat: number; lng: number };
export type Tags = Record<string, string | undefined>;
export type OsmElement = {
  type: string;
  id: number;
  nodes?: number[];
  geometry?: ({ lat: number; lon: number } | null)[];
  tags?: Tags;
};
export type Link = { to: number; length: number; id: number };
export type GraphNode = Point & { id: number; links: Link[]; turn?: boolean };
// Fractions refer to the original OSM node pair, not transient graph node IDs.
export type RoadSegmentRef = { way: number; from: number; to: number; start: number; end: number; bidirectional: boolean };
export type GraphEdge = { a: number; b: number; length: number; tags: Tags; ref?: RoadSegmentRef };
export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  grid: Map<string, number[]>;
  cell: number;
  origin: Origin;
  reachable?: Set<number>;
};
export type ShapeId = 'heart' | 'star' | 'cat' | 'rabbit' | 'house' | 'diamond' | 'bolt' | 'fish' | 'arrow' | 'custom';
export type SearchOptions = {
  mode?: 'anchored' | 'free-loop';
  version: '0.1' | '0.2';
  shape: ShapeId;
  targetKm: number;
  radiusKm: number;
  customTemplate?: Point[];
};
export type SearchInput = { origin: Origin; options: SearchOptions; elements: OsmElement[] };
export type Progress = { phase: 'graph' | 'placement' | 'routing' | 'refine'; text: string };
export type ProgressCallback = (progress: Progress) => void;
export type Steps<T> = Generator<void, T, void>;
export type Placement = {
  target: Point[];
  rotation: number;
  scale: number;
  offset: Point;
  error: number;
  scaleRatio?: number;
};
export type Usage = { edges: Map<string, number>; repeated: number; total: number };
export type Score = {
  raw: number; total: number; contour: number; flow: number; angles: number;
  distanceFit: number; reusePenalty: number; lengthKm: number;
};
export type RoadInfo = { crowd: number | null; stepsKm: number };
export type EvaluatedCandidate = Placement & {
  ids: number[]; route: Point[]; usage: Usage; access: Point[][]; loop: Point[];
  score: Score; loopKm: number; accessKm: number;
};
export type Candidate = Omit<EvaluatedCandidate, 'ids' | 'usage'> & {
  roadSegments?: RoadSegmentRef[];
  ids?: undefined;
  usage?: undefined;
  scaleRatio: number;
  templatePerimeter: number;
  roadInfo: RoadInfo;
};
export type SearchResult = {
  mode?: 'free-loop';
  version: '0.1' | '0.2';
  baseline: { candidates: { score: number; raw: number; lengthKm: number }[]; valid: number; routed: number };
  candidates: Candidate[];
  stats: { placements: number; routed: number; extraRouted: number; valid: number; roads: number };
  start: Point;
  snapMeters: number;
  template: { width: number; height: number; perimeter: number };
};
