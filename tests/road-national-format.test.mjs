import assert from 'node:assert/strict';
import test from 'node:test';
import { nationalRegions, nationalRegionId, validateNationalCatalog } from '../src/modules/road-data/national-format.ts';
import { roadBounds } from '../src/modules/road-data/client.ts';

test('all ownership corners fit full 10 km queries within their regional halo', () => {
  const regions = nationalRegions();
  assert.equal(regions.length, 192);
  for (const region of regions) {
    const [row, col] = region.id.split('_').map(Number);
    for (const lat of [row / 2, (row + 1) / 2 - 1e-10]) {
      for (const lng of [col / 2, (col + 1) / 2 - 1e-10]) {
        assert.equal(nationalRegionId({ lat, lng }), region.id);
        const q = roadBounds({ lat, lng }, 10000), b = region.coverageBounds;
        assert.ok(q[0] >= b[0] && q[1] >= b[1] && q[2] < b[2] && q[3] < b[3]);
      }
    }
  }
  for (const origin of [{ lat: NaN, lng: 127 }, { lat: 39, lng: 127 }, { lat: 37, lng: 132 }, { lat: 32.9, lng: 127 }]) {
    assert.throws(() => nationalRegionId(origin), /OUTSIDE_NATIONAL/);
  }
});

test('catalog rejects missing, duplicate, shifted and oversized regional references', () => {
  const catalog = { format: 'running-art-national-catalog', schemaVersion: 1,
    release: 'test-v1', sourceSha256: 'a'.repeat(64), regions: nationalRegions().map(r => ({
      ...r, manifest: { bytes: 1000, sha256: 'b'.repeat(64) },
    })) };
  validateNationalCatalog(catalog);
  for (const mutate of [c => c.regions.pop(), c => { c.regions[1] = c.regions[0]; },
    c => { c.regions[0].coverageBounds[0] += 0.02; }, c => { c.regions[0].manifest.bytes = 3000000; }]) {
    const changed = structuredClone(catalog); mutate(changed);
    assert.throws(() => validateNationalCatalog(changed), /ROAD_FILE_NATIONAL/);
  }
});
