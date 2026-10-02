import type { Origin } from '../route-engine/types.ts';
import type { Bounds } from './file-format.ts';

export const NATIONAL_PREFIX = 'roads/national/v1';
export const NATIONAL_QUERY_BOUNDS: Bounds = [33, 124, 39, 132];
export const NATIONAL_MAX_MANIFEST = 2 * 1024 * 1024;
export const NATIONAL_MAX_CATALOG = 256 * 1024;
export type NationalRegion = { id: string; coverageBounds: Bounds };
export type NationalReference = { bytes: number; sha256: string };
export type NationalCatalog = {
  format: 'running-art-national-catalog'; schemaVersion: 1; release: string;
  sourceSha256: string; regions: (NationalRegion & { manifest: NationalReference })[];
};
export function nationalRegions(): NationalRegion[] {
  const regions: NationalRegion[] = [];
  for (let row = 66; row < 78; row++) for (let col = 248; col < 264; col++) {
    // Half-degree ownership + seven 0.02-degree cells on each side covers the
    // full supported 10 km query even at an ownership edge/corner.
    regions.push({ id: `${row}_${col}`, coverageBounds: [
      (row * 25 - 7) / 50, (col * 25 - 7) / 50,
      ((row + 1) * 25 + 7) / 50, ((col + 1) * 25 + 7) / 50,
    ] });
  }
  return regions;
}
export function nationalRegionId(origin: Origin): string {
  const [south, west, north, east] = NATIONAL_QUERY_BOUNDS;
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || origin.lat < south ||
    origin.lat >= north || origin.lng < west || origin.lng >= east) throw new Error('ROAD_FILE_OUTSIDE_NATIONAL_COVERAGE');
  return `${Math.floor(origin.lat * 2)}_${Math.floor(origin.lng * 2)}`;
}
export function validateNationalReference(value: unknown, max: number): asserts value is NationalReference {
  const r = value as Partial<NationalReference> | null;
  if (!r || !Number.isSafeInteger(r.bytes) || r.bytes! < 1 || r.bytes! > max ||
    typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256)) throw new Error('ROAD_FILE_NATIONAL_REFERENCE');
}
export function validateNationalCatalog(value: unknown): asserts value is NationalCatalog {
  const c = value as Partial<NationalCatalog> | null;
  if (!c || c.format !== 'running-art-national-catalog' || c.schemaVersion !== 1 ||
    typeof c.release !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(c.release) ||
    typeof c.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(c.sourceSha256) ||
    !Array.isArray(c.regions)) throw new Error('ROAD_FILE_NATIONAL_CATALOG');
  const expected = nationalRegions();
  if (c.regions.length !== expected.length) throw new Error('ROAD_FILE_NATIONAL_REGIONS');
  for (let i = 0; i < expected.length; i++) {
    const region = c.regions[i];
    if (!region || region.id !== expected[i].id || JSON.stringify(region.coverageBounds) !== JSON.stringify(expected[i].coverageBounds)) {
      throw new Error('ROAD_FILE_NATIONAL_REGIONS');
    }
    validateNationalReference(region.manifest, NATIONAL_MAX_MANIFEST);
  }
}
