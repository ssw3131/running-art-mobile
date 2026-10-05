import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { calculateRoute } from '../../src/modules/route-engine/runner.ts';
import { roadBounds } from '../../src/modules/road-data/client.ts';
import { DEFAULT_ROAD_BASE_URL, createRoadHttp } from '../../src/modules/road-data/channel.ts';
import { NATIONAL_PREFIX } from '../../src/modules/road-data/national-format.ts';
import { selectRoadFiles, decodeRoadTile, mergeRoadTiles } from '../../src/modules/road-data/file-format.ts';
import { codecs, readJson, writeJson, sha256 } from '../road-data/common.mjs';
import { readInput, runCalculation } from './runtime.mjs';

const { values } = parseArgs({ options: {
  directory: { type: 'string', default: '.cache/server-compute/fixtures' },
  bundle: { type: 'string', default: 'build/road-data/national-260930' },
  download: { type: 'boolean', default: false },
} });
fs.mkdirSync(values.directory, { recursive: true });
const phone = readJson('tests/fixtures/server-compute/phone-reference.json');
const get = createRoadHttp(DEFAULT_ROAD_BASE_URL, fetch);
const entries = [];
for (const sample of phone.cases) {
  const started = performance.now();
  let input, files = [], bytesDownloaded = 0;
  if (sample.synthetic) {
    const bytes = fs.readFileSync('assets/route-lab/grid.json');
    fs.writeFileSync(path.join(values.directory, 'grid.json'), bytes);
    input = JSON.parse(bytes); input.options = sample.options;
    sample.fixtureSha256 = sha256(bytes);
  } else {
    const manifestName = `${sample.manifestHash}.json`;
    const manifestBytes = values.download
      ? await get(`${NATIONAL_PREFIX}/manifests/${manifestName}`, 2 * 1024 * 1024, 'application/json', AbortSignal.timeout(60000))
      : fs.readFileSync(path.join(values.bundle, 'manifests', manifestName));
    assert.equal(sha256(manifestBytes), sample.manifestHash);
    const manifest = JSON.parse(codecs.utf8(manifestBytes));
    assert.equal(manifest.release, sample.release);
    fs.writeFileSync(path.join(values.directory, manifestName), manifestBytes);
    sample.bounds = roadBounds(sample.origin, sample.options.radiusKm * 1000);
    files = selectRoadFiles(manifest, sample.bounds);
    assert.equal(files.length, sample.fileCount);
    const tiles = [];
    if (values.download) bytesDownloaded += manifestBytes.byteLength;
    for (const file of files) {
      const name = `${file.sha256}.json.gz`;
      const bytes = values.download
        ? await get(`${NATIONAL_PREFIX}/tiles/${name}`, file.bytes, 'application/gzip', AbortSignal.timeout(60000), true)
        : fs.readFileSync(path.join(values.bundle, file.path));
      tiles.push(decodeRoadTile(bytes, manifest, file, codecs));
      fs.writeFileSync(path.join(values.directory, name), bytes);
      if (values.download) bytesDownloaded += bytes.byteLength;
    }
    input = { origin: sample.origin, options: sample.options, elements: mergeRoadTiles(manifest, tiles, sample.bounds) };
  }
  const preparationMs = performance.now() - started;
  const entry = { ...sample, files, inputSha256: sha256(JSON.stringify(input)), preparationMs, bytesDownloaded };
  assert.deepEqual(readInput(values.directory, entry), input);
  const sync = runCalculation(input);
  const mobile = await calculateRoute(input);
  assert.equal(sha256(JSON.stringify(mobile.result)), sync.resultSha256, 'Full sync/cooperative result differs');
  assert.deepEqual(mobile.metrics.routing, sync.metrics.routing, 'Sync/cooperative routing differs');
  assert.equal(sync.metrics.nodes, sample.phone.nodes);
  assert.equal(sync.metrics.edges, sample.phone.edges);
  assert.equal(sync.metrics.candidates, sample.phone.candidates);
  assert.deepEqual(sync.metrics.routing, sample.phone.routing, 'Phone routing differs');
  // Hermes/V8 floating point library results may differ slightly. Preserve and report the error.
  const maxScoreError = Math.max(...sync.metrics.scores.map((score, i) => Math.abs(score - sample.phone.scores[i])));
  assert.ok(maxScoreError < 1e-9, `Phone score differs: ${maxScoreError}`);
  if (sample.synthetic) {
    const baseline = readJson('assets/route-lab/baselines.json').find(b => b.fixture === 'grid' && b.options.shape === 'heart' && b.options.targetKm === 5 && b.options.version === '0.2');
    assert.ok(baseline);
    assert.deepEqual(JSON.parse(sync.serialized), baseline.result);
  }
  entry.expectedResultSha256 = sync.resultSha256;
  entry.verification = { fullNodeRunnerMatch: true, phoneRoutingMatch: true, phoneMaxScoreError: maxScoreError,
    fullPhoneGeometryCompared: sample.synthetic, nodeCooperativeMs: mobile.metrics.elapsedMs, synchronousMs: sync.metrics.calculationMs };
  fs.writeFileSync(path.join(values.directory, `${sample.id}-result.json`), sync.serialized);
  entries.push(entry);
  console.log(JSON.stringify({ id: entry.id, preparationMs, verification: entry.verification }));
}
writeJson(path.join(values.directory, 'index.json'), { recordedAt: new Date().toISOString(),
  transport: values.download ? 'public R2 HTTPS to this PC, pinned immutable files' : 'existing local public-road bundle',
  phoneSource: phone.source, cases: entries });
