import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { nationalRegions, validateNationalCatalog, NATIONAL_MAX_MANIFEST } from '../../src/modules/road-data/national-format.ts';
import { validateManifest } from '../../src/modules/road-data/file-format.ts';
import { readJson, writeJson, sha256 } from './common.mjs';

const { values } = parseArgs({ options: { input: { type: 'string', default: 'build/road-data/national-verified' },
  'source-lock': { type: 'string', default: 'scripts/road-data/source-lock.json' } } });
const inventory = readJson(path.join(values.input, 'inventory.json'));
assert.equal(inventory.format, 'running-art-national-inventory');
assert.match(inventory.extractionSha256 ?? '', /^[a-f0-9]{64}$/);
assert.deepEqual(inventory.source, readJson(values['source-lock']));
const byId = new Map(inventory.files.map(f => [f.id, f]));
assert.equal(byId.size, inventory.files.length);
const regions = [], stats = [];
fs.mkdirSync(path.join(values.input, 'manifests'), { recursive: true });
for (const region of nationalRegions()) {
  const files = [], emptyCells = [], box = region.coverageBounds;
  for (let r = Math.round(box[0] * 50); r < Math.round(box[2] * 50); r++) {
    for (let c = Math.round(box[1] * 50); c < Math.round(box[3] * 50); c++) {
      const id = `${r}_${c}`, file = byId.get(id);
      if (file) files.push(file); else emptyCells.push(id);
    }
  }
  const manifest = { format: 'running-art-road-manifest', schemaVersion: 1, release: inventory.release,
    coverage: 'national', coverageBounds: box, coordinateOrder: 'lat,lon', gridStepE7: inventory.gridStepE7,
    source: inventory.source, files, emptyCells };
  validateManifest(manifest);
  const bytes = Buffer.from(JSON.stringify(manifest) + '\n'), hash = sha256(bytes);
  assert.ok(bytes.length <= NATIONAL_MAX_MANIFEST);
  fs.writeFileSync(path.join(values.input, 'manifests', `${hash}.json`), bytes);
  regions.push({ ...region, manifest: { bytes: bytes.length, sha256: hash } });
  stats.push({ id: region.id, manifestBytes: bytes.length, files: files.length, emptyCells: emptyCells.length });
}
const catalog = { format: 'running-art-national-catalog', schemaVersion: 1, release: inventory.release,
  sourceSha256: inventory.source.sha256, regions };
validateNationalCatalog(catalog);
writeJson(path.join(values.input, 'catalog.json'), catalog);
writeJson(path.join(values.input, 'regions-report.json'), { regions: stats,
  maxManifestBytes: Math.max(...stats.map(s => s.manifestBytes)),
  catalogBytes: fs.statSync(path.join(values.input, 'catalog.json')).size });
console.log(JSON.stringify({ regions: regions.length, maxManifestBytes: Math.max(...stats.map(s => s.manifestBytes)) }));
