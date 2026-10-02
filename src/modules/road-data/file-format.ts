// 4-1 local supply contract. Production HTTP loader/cache is deliberately separate.
import type { OsmElement } from '../route-engine/types.ts';

export type Bounds = [number, number, number, number]; // south, west, north, east
export type RoadWay = Omit<OsmElement, 'type' | 'nodes' | 'geometry' | 'tags'> & {
  type: 'way'; nodes: number[]; geometry: { lat: number; lon: number }[]; tags: Record<string, string>;
};
export type RoadFile = {
  id: string; bounds: Bounds; path: string; encoding: 'gzip'; bytes: number; sha256: string;
  decodedBytes: number; decodedSha256: string; ways: number;
  tileRelease?: string; // National manifests may explicitly reuse identical older tile bytes.
};
export type RoadManifest = {
  format: 'running-art-road-manifest'; schemaVersion: 1; release: string;
  coverage: 'samples' | 'national'; coverageBounds?: Bounds; emptyCells?: string[];
  coordinateOrder: 'lat,lon'; gridStepE7: number;
  source: { sha256: string; dataTimestamp: string; url: string; license: 'ODbL-1.0'; attribution: string };
  files: RoadFile[];
};
export type RoadTile = {
  format: 'running-art-road-tile'; schemaVersion: 1; release: string; id: string;
  bounds: Bounds; coordinateOrder: 'lat,lon'; elements: RoadWay[];
};

const MAX_PACKED = 8 * 1024 * 1024;
const MAX_DECODED = 32 * 1024 * 1024;
const hashPattern = /^[a-f0-9]{64}$/;
const releasePattern = /^[a-z0-9][a-z0-9-]{0,99}$/;
function requireValid(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`ROAD_FILE_${reason}`);
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
export function validateBounds(value: unknown): asserts value is Bounds {
  requireValid(Array.isArray(value) && value.length === 4 && value.every(Number.isFinite) &&
    value[0] >= -85 && value[2] <= 85 && value[1] >= -180 && value[3] <= 180 &&
    value[0] < value[2] && value[1] < value[3], 'BOUNDS');
}

export function cellBounds(row: number, column: number, step: number): Bounds {
  return [row * step / 1e7, column * step / 1e7, (row + 1) * step / 1e7, (column + 1) * step / 1e7];
}

export function coveringCells(bounds: Bounds, step: number): { id: string; bounds: Bounds }[] {
  validateBounds(bounds);
  requireValid(integer(step, 100000, 400000) && [100000, 200000, 400000].includes(step), 'GRID');
  const south = Math.floor(bounds[0] * 1e7 / step), west = Math.floor(bounds[1] * 1e7 / step);
  const north = Math.floor(bounds[2] * 1e7 / step), east = Math.floor(bounds[3] * 1e7 / step);
  requireValid((north - south + 1) * (east - west + 1) <= 400, 'AREA_TOO_LARGE');
  const cells = [];
  for (let row = south; row <= north; row++) for (let col = west; col <= east; col++) {
    cells.push({ id: `${row}_${col}`, bounds: cellBounds(row, col, step) });
  }
  return cells;
}

export function segmentIntersectsBounds(a: { lat: number; lon: number }, b: { lat: number; lon: number }, box: Bounds): boolean {
  let low = 0, high = 1;
  for (const [start, end, min, max] of [[a.lat, b.lat, box[0], box[2]], [a.lon, b.lon, box[1], box[3]]]) {
    const delta = end - start;
    if (delta === 0) { if (start < min || start > max) return false; }
    else {
      const first = (min - start) / delta, last = (max - start) / delta;
      low = Math.max(low, Math.min(first, last)); high = Math.min(high, Math.max(first, last));
      if (low > high) return false;
    }
  }
  return true;
}

export function wayIntersectsBounds(way: RoadWay, bounds: Bounds): boolean {
  return way.geometry.slice(1).some((point, i) => segmentIntersectsBounds(way.geometry[i], point, bounds));
}

export function validateManifest(value: unknown): asserts value is RoadManifest {
  requireValid(object(value), 'MANIFEST');
  requireValid(value.format === 'running-art-road-manifest' && value.schemaVersion === 1, 'VERSION');
  requireValid(typeof value.release === 'string' && releasePattern.test(value.release), 'RELEASE');
  requireValid(['samples', 'national'].includes(value.coverage as string) && value.coordinateOrder === 'lat,lon', 'COORDINATES');
  requireValid([100000, 200000, 400000].includes(value.gridStepE7 as number), 'GRID');
  if (value.coverage === 'national') {
    validateBounds(value.coverageBounds);
    requireValid(value.gridStepE7 === 200000, 'GRID');
    const box = value.coverageBounds;
    requireValid(box.every(n => Math.abs(n * 50 - Math.round(n * 50)) < 1e-8) &&
      (box[2] - box[0]) <= 1 && (box[3] - box[1]) <= 1, 'COVERAGE');
  } else requireValid(value.coverageBounds === undefined && value.emptyCells === undefined, 'COVERAGE');
  requireValid(object(value.source) && typeof value.source.sha256 === 'string' && hashPattern.test(value.source.sha256) &&
    typeof value.source.dataTimestamp === 'string' && Number.isFinite(Date.parse(value.source.dataTimestamp)) &&
    typeof value.source.url === 'string' && value.source.url.startsWith('https://') &&
    value.source.license === 'ODbL-1.0' && typeof value.source.attribution === 'string', 'SOURCE');
  requireValid(Array.isArray(value.files) && (value.files.length > 0 || value.coverage === 'national') && value.files.length <= 10000, 'FILES');
  const seen = new Set();
  for (const file of value.files) {
    requireValid(object(file) && typeof file.id === 'string' && /^-?\d+_-?\d+$/.test(file.id), 'CELL');
    requireValid(!seen.has(file.id), 'DUPLICATE_CELL'); seen.add(file.id);
    const [row, col] = file.id.split('_').map(Number);
    validateBounds(file.bounds);
    if (value.coverage === 'national') {
      const box = value.coverageBounds as Bounds;
      requireValid(file.bounds[0] >= box[0] && file.bounds[1] >= box[1] &&
        file.bounds[2] <= box[2] && file.bounds[3] <= box[3], 'COVERAGE');
    }
    requireValid(JSON.stringify(file.bounds) === JSON.stringify(cellBounds(row, col, value.gridStepE7 as number)), 'CELL_BOUNDS');
    requireValid(file.path === `tiles/${file.id}.json.gz` && file.encoding === 'gzip', 'PATH');
    requireValid(integer(file.bytes, 1, MAX_PACKED) && integer(file.decodedBytes, 1, MAX_DECODED) &&
      integer(file.ways, 0, 100000), 'SIZE');
    requireValid(typeof file.sha256 === 'string' && hashPattern.test(file.sha256) &&
      typeof file.decodedSha256 === 'string' && hashPattern.test(file.decodedSha256), 'HASH');
    requireValid(file.tileRelease === undefined || (value.coverage === 'national' &&
      typeof file.tileRelease === 'string' && releasePattern.test(file.tileRelease)), 'TILE_RELEASE');
  }
  if (value.coverage === 'national') {
    const box = value.coverageBounds as Bounds;
    requireValid(Array.isArray(value.emptyCells) && value.emptyCells.length <= 2500, 'EMPTY_CELLS');
    for (const id of value.emptyCells) {
      requireValid(typeof id === 'string' && !seen.has(id), 'DUPLICATE_CELL');
      seen.add(id);
    }
    let count = 0;
    for (let row = Math.round(box[0] * 50); row < Math.round(box[2] * 50); row++) {
      for (let col = Math.round(box[1] * 50); col < Math.round(box[3] * 50); col++) {
        requireValid(seen.has(`${row}_${col}`), 'MISSING_CELL');
        count++;
      }
    }
    requireValid(seen.size === count, 'COVERAGE');
  }
}

export function selectRoadFiles(manifest: RoadManifest, bounds: Bounds): RoadFile[] {
  validateManifest(manifest);
  validateBounds(bounds);
  if (manifest.coverage === 'national') {
    const box = manifest.coverageBounds!;
    requireValid(bounds[0] >= box[0] && bounds[1] >= box[1] && bounds[2] < box[2] && bounds[3] < box[3], 'MISSING_CELL');
  }
  const byId = new Map(manifest.files.map(file => [file.id, file]));
  const empty = new Set(manifest.emptyCells ?? []);
  return coveringCells(bounds, manifest.gridStepE7).flatMap(cell => {
    const file = byId.get(cell.id);
    // An authenticated, explicit empty-cell declaration is required. A missing
    // entry must never silently turn incomplete generation into empty roads.
    if (!file && empty.has(cell.id)) return [];
    requireValid(file, 'MISSING_CELL');
    return [file];
  });
}

export function validateRoadTile(value: unknown, manifest: RoadManifest, file: RoadFile): asserts value is RoadTile {
  requireValid(object(value), 'TILE');
  requireValid(value.format === 'running-art-road-tile' && value.schemaVersion === manifest.schemaVersion, 'VERSION');
  requireValid(value.release === (file.tileRelease ?? manifest.release), 'RELEASE_MISMATCH');
  requireValid(value.id === file.id && JSON.stringify(value.bounds) === JSON.stringify(file.bounds), 'CELL_MISMATCH');
  requireValid(value.coordinateOrder === 'lat,lon', 'COORDINATES');
  requireValid(Array.isArray(value.elements) && value.elements.length === file.ways, 'WAY_COUNT');
  let previousId = 0;
  for (const way of value.elements) {
    requireValid(object(way) && way.type === 'way' && integer(way.id, 1, Number.MAX_SAFE_INTEGER) && way.id > previousId, 'WAY_ID');
    previousId = way.id;
    requireValid(Array.isArray(way.nodes) && Array.isArray(way.geometry) && way.nodes.length >= 2 &&
      way.nodes.length === way.geometry.length && way.nodes.every((id: unknown) => integer(id, 1, Number.MAX_SAFE_INTEGER)), 'NODES');
    requireValid(way.geometry.every((p: unknown) => object(p) && typeof p.lat === 'number' && Number.isFinite(p.lat) &&
      Math.abs(p.lat) <= 85 && typeof p.lon === 'number' && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180), 'GEOMETRY');
    requireValid(object(way.tags) && typeof way.tags.highway === 'string' && Object.values(way.tags).every(t => typeof t === 'string'), 'TAGS');
    requireValid(wayIntersectsBounds(way as RoadWay, file.bounds), 'WAY_OUTSIDE_CELL');
  }
}

// Host adapters must bound decompression before allocation (Node: maxOutputLength).
export type RoadCodecs = {
  sha256: (bytes: Uint8Array) => string;
  gunzip: (bytes: Uint8Array, maxBytes: number) => Uint8Array;
  utf8: (bytes: Uint8Array) => string;
};
export function decodeRoadTile(bytes: Uint8Array, manifest: RoadManifest, file: RoadFile, codecs: RoadCodecs): RoadTile {
  requireValid(bytes.byteLength === file.bytes && bytes.byteLength <= MAX_PACKED, 'SIZE');
  requireValid(codecs.sha256(bytes) === file.sha256, 'HASH_MISMATCH');
  const decoded = codecs.gunzip(bytes, Math.min(file.decodedBytes, MAX_DECODED));
  requireValid(decoded.byteLength === file.decodedBytes, 'DECODED_SIZE');
  requireValid(codecs.sha256(decoded) === file.decodedSha256, 'DECODED_HASH');
  const tile: unknown = JSON.parse(codecs.utf8(decoded));
  validateRoadTile(tile, manifest, file);
  return tile;
}

function waySignature(way: RoadWay): string {
  return JSON.stringify([way.nodes, way.geometry.map(p => [p.lat, p.lon]), Object.entries(way.tags).sort(([a], [b]) => a.localeCompare(b))]);
}

export function mergeRoadTiles(manifest: RoadManifest, tiles: RoadTile[], bounds: Bounds): RoadWay[] {
  const files = selectRoadFiles(manifest, bounds);
  requireValid(files.length === tiles.length, 'MISSING_OR_DUPLICATE_TILE');
  const byId = new Map(tiles.map(tile => [tile.id, tile]));
  requireValid(byId.size === tiles.length, 'DUPLICATE_TILE');
  const ways = new Map<number, RoadWay>(), signatures = new Map<number, string>();
  const coordinates = new Map<number, string>();
  for (const file of files) {
    const tile = byId.get(file.id);
    validateRoadTile(tile, manifest, file);
    for (const way of tile.elements) {
      const signature = waySignature(way);
      if (ways.has(way.id)) { requireValid(signatures.get(way.id) === signature, 'CONFLICTING_WAY'); continue; }
      for (let i = 0; i < way.nodes.length; i++) {
        const id = way.nodes[i], coordinate = JSON.stringify([way.geometry[i].lat, way.geometry[i].lon]);
        requireValid(!coordinates.has(id) || coordinates.get(id) === coordinate, 'CONFLICTING_NODE');
        coordinates.set(id, coordinate);
      }
      ways.set(way.id, way); signatures.set(way.id, signature);
    }
  }
  return [...ways.values()].filter(way => wayIntersectsBounds(way, bounds)).sort((a, b) => a.id - b.id);
}
