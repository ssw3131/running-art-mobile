import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { runnable } from '../../src/modules/route-engine/engine.ts';
import { cellBounds, wayIntersectsBounds } from '../../src/modules/road-data/file-format.ts';
import { readJson, writeJson, sha256 } from './common.mjs';

// A disk spatial index bounds memory to one tile; no national JSON.parse or
// nationwide list repeatedly scanned for each cell. This stage does not publish.
const { values } = parseArgs({ options: {
  input: { type: 'string', default: '.cache/road-data/national-extracted.jsonl' },
  output: { type: 'string', default: 'build/road-data/national' },
  'source-lock': { type: 'string', default: 'scripts/road-data/source-lock.json' },
  'reuse-directory': { type: 'string' },
} });
const started = performance.now(), step = 200000;
const previous = values['reuse-directory'] ? readJson(path.join(values['reuse-directory'], 'inventory.json')) : undefined;
if (previous) assert.equal(previous.gridStepE7, step);
const previousById = new Map(previous?.files.map(file => [file.id, file]) ?? []);
let reusedTiles = 0;
const extraction = readJson(values.input + '.report.json');
assert.ok(extraction.national && extraction.jsonl, 'Completed national JSONL extraction report required');
const pinnedSource = readJson(values['source-lock']);
assert.deepEqual(extraction.source, pinnedSource);
assert.equal(fs.statSync(values.input).size, extraction.outputBytes, 'Extraction size mismatch');
const inputHash = createHash('sha256');
for await (const chunk of fs.createReadStream(values.input)) inputHash.update(chunk);
assert.equal(inputHash.digest('hex'), extraction.outputSha256, 'Extraction hash mismatch');
fs.mkdirSync(values.output, { recursive: true });
const database = path.join(values.output, 'spatial.sqlite');
assert.ok(!fs.existsSync(database), 'Output already contains an index; use a fresh output directory');
const db = new DatabaseSync(database);
try {
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
    CREATE TABLE ways(id INTEGER PRIMARY KEY, body TEXT NOT NULL);
    CREATE VIRTUAL TABLE extents USING rtree(id,south,north,west,east);
    CREATE TABLE cells(row INTEGER,column INTEGER,PRIMARY KEY(row,column));`);
  const insert = db.prepare('INSERT INTO ways VALUES(?,?)');
  const extent = db.prepare('INSERT INTO extents VALUES(?,?,?,?,?)');
  const cell = db.prepare('INSERT OR IGNORE INTO cells VALUES(?,?)');
  const lines = readline.createInterface({ input: fs.createReadStream(values.input), crlfDelay: Infinity });
  let metadata, scanned = 0, kept = 0;
  db.exec('BEGIN');
  for await (const line of lines) {
    const value = JSON.parse(line);
    if (!metadata) {
      assert.equal(value.regions, null, 'National extraction required');
      assert.deepEqual(value.source, pinnedSource);
      metadata = value; continue;
    }
    scanned++;
    if (!runnable(value.tags)) continue;
    const lats = value.geometry.map(p => p.lat), lons = value.geometry.map(p => p.lon);
    const south = Math.min(...lats), north = Math.max(...lats), west = Math.min(...lons), east = Math.max(...lons);
    insert.run(value.id, line); extent.run(value.id, south, north, west, east);
    // Candidate cells include boundary touches. Exact segment intersection below
    // discards bounding-box-only overlaps without dropping crossing segments.
    const seen = new Set();
    for (let i = 1; i < value.geometry.length; i++) {
      const a = value.geometry[i - 1], b = value.geometry[i];
      const r0 = Math.floor(Math.min(a.lat, b.lat) * 1e7 / step - 1e-9);
      const r1 = Math.floor(Math.max(a.lat, b.lat) * 1e7 / step);
      const c0 = Math.floor(Math.min(a.lon, b.lon) * 1e7 / step - 1e-9);
      const c1 = Math.floor(Math.max(a.lon, b.lon) * 1e7 / step);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const id = `${r}_${c}`;
        if (!seen.has(id)) { seen.add(id); cell.run(r, c); }
      }
    }
    kept++;
    if (kept % 10000 === 0) { db.exec('COMMIT; BEGIN'); console.log(JSON.stringify({ phase: 'index', scanned, kept })); }
  }
  db.exec('COMMIT');
  assert.ok(metadata && kept > 0, 'Empty national source');
  assert.equal(scanned, extraction.extractedWays, 'Incomplete national extraction');
  const indexedMs = performance.now() - started;
  const release = `kr-${metadata.source.dataTimestamp.slice(0, 10).replaceAll('-', '')}-${metadata.source.sha256.slice(0, 12)}-roads-v1`;
  const candidates = db.prepare(`SELECT w.body FROM extents e JOIN ways w ON w.id=e.id
    WHERE e.south<=? AND e.north>=? AND e.west<=? AND e.east>=? ORDER BY w.id`);
  const files = [];
  fs.mkdirSync(path.join(values.output, 'tiles'), { recursive: true });
  for (const { row, column } of db.prepare('SELECT row,column FROM cells ORDER BY row,column').all()) {
    const bounds = cellBounds(row, column, step), id = `${row}_${column}`;
    const elements = candidates.all(bounds[2], bounds[0], bounds[3], bounds[1]).map(r => JSON.parse(r.body))
      .filter(w => wayIntersectsBounds(w, bounds));
    if (!elements.length) continue;
    for (const way of elements) way.tags = Object.fromEntries(Object.entries(way.tags).sort(([a], [b]) => a.localeCompare(b)));
    const tile = { format: 'running-art-road-tile', schemaVersion: 1,
      release, id, bounds, coordinateOrder: 'lat,lon', elements };
    let decoded = Buffer.from(JSON.stringify(tile)), packed, tileRelease;
    const old = previousById.get(id);
    if (old) {
      const oldRelease = old.tileRelease ?? previous.release;
      const candidate = Buffer.from(JSON.stringify({ ...tile, release: oldRelease }));
      if (candidate.length === old.decodedBytes && sha256(candidate) === old.decodedSha256) {
        const original = fs.readFileSync(path.join(values['reuse-directory'], `tiles/${id}.json.gz`));
        assert.equal(original.length, old.bytes); assert.equal(sha256(original), old.sha256);
        assert.deepEqual(gunzipSync(original, { maxOutputLength: old.decodedBytes }), candidate);
        packed = original; decoded = candidate; tileRelease = oldRelease; reusedTiles++;
      }
    }
    packed ??= gzipSync(decoded, { level: 6 });
    assert.ok(packed.length <= 8 * 1024 * 1024 && decoded.length <= 32 * 1024 * 1024, `Tile exceeds mobile limits: ${id}`);
    const relative = `tiles/${id}.json.gz`;
    fs.writeFileSync(path.join(values.output, relative), packed);
    files.push({ id, bounds, path: relative, encoding: 'gzip', bytes: packed.length, sha256: sha256(packed),
      decodedBytes: decoded.length, decodedSha256: sha256(decoded), ways: elements.length,
      ...(tileRelease && tileRelease !== release ? { tileRelease } : {}) });
    if (files.length % 1000 === 0) console.log(JSON.stringify({ phase: 'tiles', files: files.length }));
  }
  // Inventory is not a mobile manifest. Regional manifests must explicitly
  // declare verified empty cells as well as all present tiles.
  writeJson(path.join(values.output, 'inventory.json'), { format: 'running-art-national-inventory',
    schemaVersion: 1, release, gridStepE7: step, source: metadata.source, extractionSha256: extraction.outputSha256, files });
  const report = { source: metadata.source, extractionSha256: extraction.outputSha256, scannedWays: scanned, runnableWays: kept, files: files.length, reusedTiles,
    gzipBytes: files.reduce((n, f) => n + f.bytes, 0), decodedBytes: files.reduce((n, f) => n + f.decodedBytes, 0),
    largestGzipBytes: Math.max(...files.map(f => f.bytes)), largestDecodedBytes: Math.max(...files.map(f => f.decodedBytes)),
    indexMs: indexedMs, totalMs: performance.now() - started, maxRssKiB: process.resourceUsage().maxRSS,
    nodeVersion: process.version };
  writeJson(path.join(values.output, 'packaging-report.json'), report);
  console.log(JSON.stringify(report));
} finally { db.close(); }
