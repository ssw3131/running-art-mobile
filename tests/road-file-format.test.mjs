import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { codecs, sha256 } from '../scripts/road-data/common.mjs';
import { coveringCells, segmentIntersectsBounds, wayIntersectsBounds, validateManifest,
  decodeRoadTile, mergeRoadTiles, selectRoadFiles } from '../src/modules/road-data/file-format.ts';

const bounds = [37.479, 126.879, 37.481, 126.881];
const makeWay = (id, nodes, geometry, tags = { highway: 'footway' }) => ({ type: 'way', id, nodes,
  geometry: geometry.map(([lat, lon]) => ({ lat, lon })), tags });
const crossing = makeWay(10, [1, 2], [[37.48, 126.87], [37.48, 126.89]]);
const connected = makeWay(11, [2, 3], [[37.48, 126.89], [37.4795, 126.8805]]);

test('national coverage requires an explicit complete partition of files and empty cells', () => {
  const { manifest } = fixture();
  manifest.coverage = 'national';
  manifest.coverageBounds = [37.46, 126.86, 37.5, 126.9];
  manifest.emptyCells = [];
  validateManifest(manifest);
  const removed = manifest.files.pop();
  assert.throws(() => validateManifest(manifest), /MISSING_CELL/);
  manifest.emptyCells.push(removed.id);
  validateManifest(manifest);
  assert.equal(selectRoadFiles(manifest, bounds).length, 3);
  manifest.emptyCells.push(manifest.files[0].id);
  assert.throws(() => validateManifest(manifest), /DUPLICATE_CELL/);
});

test('national empty coverage is valid only within its verified bounds', () => {
  const { manifest } = fixture();
  manifest.coverage = 'national';
  manifest.coverageBounds = [37.46, 126.86, 37.5, 126.9];
  manifest.emptyCells = manifest.files.map(f => f.id);
  manifest.files = [];
  assert.deepEqual(mergeRoadTiles(manifest, [], bounds), []);
  assert.throws(() => selectRoadFiles(manifest, [37.49, 126.88, 37.51, 126.89]), /MISSING_CELL/);
  manifest.emptyCells.push('9999_9999');
  assert.throws(() => validateManifest(manifest), /COVERAGE/);
});

test('national manifests reuse a previous tile only with its explicit release and exact hashes', () => {
  const { manifest, buffers } = fixture();
  manifest.coverage = 'national'; manifest.coverageBounds = [37.46,126.86,37.5,126.9]; manifest.emptyCells = [];
  const oldRelease = manifest.release; manifest.release = 'updated-v2';
  assert.throws(() => decodeRoadTile(buffers[0],manifest,manifest.files[0],codecs), /RELEASE_MISMATCH/);
  for (const file of manifest.files) file.tileRelease = oldRelease;
  validateManifest(manifest);
  assert.equal(decodeRoadTile(buffers[0],manifest,manifest.files[0],codecs).release,oldRelease);
  const corrupt = Buffer.from(buffers[0]); corrupt[20] ^= 1;
  assert.throws(() => decodeRoadTile(corrupt,manifest,manifest.files[0],codecs), /HASH/);
  manifest.coverage = 'samples'; delete manifest.coverageBounds; delete manifest.emptyCells;
  assert.throws(() => validateManifest(manifest), /TILE_RELEASE/);
});

function fixture(ways = [crossing, connected]) {
  const manifest = { format: 'running-art-road-manifest', schemaVersion: 1, release: 'test-v1',
    coverage: 'samples', coordinateOrder: 'lat,lon', gridStepE7: 200000,
    source: { sha256: 'a'.repeat(64), dataTimestamp: '2026-09-29T20:22:51Z',
      url: 'https://download.geofabrik.de/test', license: 'ODbL-1.0', attribution: 'OSM' }, files: [] };
  const tiles = [], buffers = [];
  for (const cell of coveringCells(bounds, manifest.gridStepE7)) {
    const tile = { format: 'running-art-road-tile', schemaVersion: 1, release: manifest.release,
      coordinateOrder: 'lat,lon', ...cell, elements: structuredClone(ways.filter(w => wayIntersectsBounds(w, cell.bounds))) };
    const decoded = Buffer.from(JSON.stringify(tile)), packed = gzipSync(decoded);
    manifest.files.push({ ...cell, path: `tiles/${cell.id}.json.gz`, encoding: 'gzip', bytes: packed.length,
      decodedBytes: decoded.length, sha256: sha256(packed), decodedSha256: sha256(decoded), ways: tile.elements.length });
    tiles.push(tile); buffers.push(packed);
  }
  return { manifest, tiles, buffers };
}

test('a segment crosses a region even with no inside vertices, and touching borders are included', () => {
  assert.ok(wayIntersectsBounds(crossing, bounds));
  assert.ok(!crossing.geometry.some(p => p.lon >= bounds[1] && p.lon <= bounds[3]));
  assert.ok(segmentIntersectsBounds({ lat: bounds[0], lon: 126.87 }, { lat: bounds[0], lon: 126.89 }, bounds));
  assert.ok(!segmentIntersectsBounds({ lat: 37.4789, lon: 126.87 }, { lat: 37.4789, lon: 126.89 }, bounds));
  assert.ok(!segmentIntersectsBounds({ lat: 37.47, lon: 126.88 }, { lat: 37.48, lon: 126.87 }, bounds));
});

test('four-cell junction retains IDs, full ways, tags and deterministic order, deduplicating identical ways', () => {
  const { manifest, tiles, buffers } = fixture();
  assert.equal(tiles.length, 4);
  validateManifest(manifest);
  const decoded = buffers.map((b, i) => decodeRoadTile(b, manifest, manifest.files[i], codecs));
  assert.deepEqual(decoded, tiles);
  assert.deepEqual(mergeRoadTiles(manifest, decoded.reverse(), bounds), [crossing, connected]);
});

test('same coordinates with different OSM IDs stay separate', () => {
  const separate = makeWay(12, [101, 102], [[37.48, 126.87], [37.48, 126.89]]);
  const { manifest, tiles } = fixture([crossing, separate]);
  assert.deepEqual(mergeRoadTiles(manifest, tiles, bounds).map(w => w.nodes), [[1, 2], [101, 102]]);
});

test('missing and duplicate cells cannot look like a successful partial region', () => {
  const { manifest, tiles } = fixture();
  assert.throws(() => mergeRoadTiles(manifest, tiles.slice(1), bounds), /MISSING/);
  assert.throws(() => mergeRoadTiles(manifest, [tiles[0], tiles[0], ...tiles.slice(2)], bounds), /DUPLICATE/);
  const missing = structuredClone(manifest); missing.files.pop();
  assert.throws(() => mergeRoadTiles(missing, tiles.slice(0, -1), bounds), /MISSING_CELL/);
});

test('schema, release, coordinate order, unsafe paths, and oversized inputs are rejected', () => {
  const { manifest, tiles } = fixture();
  for (const edit of [m => { m.schemaVersion = 2; }, m => { m.coordinateOrder = 'lon,lat'; },
    m => { m.files[0].path = '../../secret'; }, m => { m.files[0].decodedBytes = 100000000; },
    m => { m.files.push(m.files[0]); }]) {
    const invalid = structuredClone(manifest); edit(invalid);
    assert.throws(() => validateManifest(invalid), /ROAD_FILE_/);
  }
  const mixed = structuredClone(tiles); mixed[0].release = 'other';
  assert.throws(() => mergeRoadTiles(manifest, mixed, bounds), /RELEASE_MISMATCH/);
});

test('compressed damage, truncation, decoded hash mismatch, and expansion beyond declared bytes are rejected', () => {
  const { manifest, buffers } = fixture();
  const damaged = Buffer.from(buffers[0]); damaged[15] ^= 1;
  assert.throws(() => decodeRoadTile(damaged, manifest, manifest.files[0], codecs), /HASH_MISMATCH/);
  assert.throws(() => decodeRoadTile(buffers[0].subarray(1), manifest, manifest.files[0], codecs), /SIZE/);
  assert.throws(() => decodeRoadTile(buffers[0], manifest, { ...manifest.files[0], decodedSha256: 'b'.repeat(64) }, codecs), /DECODED_HASH/);
  assert.throws(() => decodeRoadTile(buffers[0], manifest, { ...manifest.files[0], decodedBytes: 10 }, codecs));
});

test('conflicting copies of a way, shared-node coordinates and malformed node arrays fail', () => {
  const { manifest, tiles } = fixture();
  const conflict = structuredClone(tiles);
  conflict[1].elements[0].tags.name = 'conflicting';
  assert.throws(() => mergeRoadTiles(manifest, conflict, bounds), /CONFLICTING_WAY/);
  const badNode = makeWay(12, [2, 44], [[37.48, 126.8801], [37.4801, 126.8801]]);
  const bad = fixture([crossing, badNode]);
  assert.throws(() => mergeRoadTiles(bad.manifest, bad.tiles, bounds), /CONFLICTING_NODE/);
  const invalid = structuredClone(tiles); invalid[0].elements[0].nodes.pop();
  assert.throws(() => mergeRoadTiles(manifest, invalid, bounds), /NODES/);
});

test('invalid coordinates and duplicate IDs inside a tile fail', () => {
  const { manifest, tiles } = fixture();
  const invalid = structuredClone(tiles); invalid[0].elements[0].geometry[0].lat = NaN;
  assert.throws(() => mergeRoadTiles(manifest, invalid, bounds), /GEOMETRY/);
  const dup = structuredClone(tiles), changed = structuredClone(manifest);
  dup[0].elements.push(dup[0].elements[0]); changed.files[0].ways++;
  assert.throws(() => mergeRoadTiles(changed, dup, bounds), /WAY_ID/);
});
