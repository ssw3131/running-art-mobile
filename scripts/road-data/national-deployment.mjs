import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NATIONAL_PREFIX, NATIONAL_MAX_CATALOG, validateNationalCatalog } from '../../src/modules/road-data/national-format.ts';
import { validateManifest, decodeRoadTile } from '../../src/modules/road-data/file-format.ts';
import { IMMUTABLE_CACHE, CURRENT_CACHE, jsonBytes } from './deployment.mjs';
import { sha256, codecs } from './common.mjs';

export const NATIONAL_CURRENT_KEY = `${NATIONAL_PREFIX}/current.json`;
export function loadNationalBundle(directory) {
  const base = fs.realpathSync(directory);
  function read(relative, limit) {
    const filename = fs.realpathSync(path.join(base, relative));
    assert.ok(filename.startsWith(base + path.sep), '배포 입력 경로 이탈');
    assert.ok(fs.statSync(filename).size <= limit, '배포 입력 크기 초과');
    return fs.readFileSync(filename);
  }
  const inventory = JSON.parse(read('inventory.json', 32 * 1024 * 1024));
  assert.equal(inventory.format, 'running-art-national-inventory');
  assert.match(inventory.extractionSha256 ?? '', /^[a-f0-9]{64}$/);
  const catalogBody = read('catalog.json', NATIONAL_MAX_CATALOG), catalog = JSON.parse(catalogBody);
  validateNationalCatalog(catalog);
  assert.equal(catalog.release, inventory.release);
  assert.equal(catalog.sourceSha256, inventory.source.sha256);
  const inventoryById = new Map(inventory.files.map(f => [f.id, f]));
  assert.equal(inventoryById.size, inventory.files.length);
  const objects = [], tileHashes = new Set();
  function object(key, relative, bytes, hash, type) {
    // Read lazily so preparing or uploading all Korean tiles does not allocate
    // the full nationwide payload in RAM. Recheck bytes at every access.
    return { key, sha256: hash, contentType: type, cacheControl: IMMUTABLE_CACHE,
      get body() { const body = read(relative, bytes); assert.equal(body.length, bytes); assert.equal(sha256(body), hash); return body; } };
  }
  for (const region of catalog.regions) {
    const relative = `manifests/${region.manifest.sha256}.json`;
    const body = read(relative, region.manifest.bytes);
    assert.equal(body.length, region.manifest.bytes); assert.equal(sha256(body), region.manifest.sha256);
    const manifest = JSON.parse(body); validateManifest(manifest);
    assert.equal(manifest.coverage, 'national'); assert.equal(manifest.release, catalog.release);
    assert.deepEqual(manifest.source, inventory.source);
    assert.deepEqual(manifest.coverageBounds, region.coverageBounds);
    for (const id of manifest.emptyCells) assert.ok(!inventoryById.has(id), '도로가 있는 칸을 빈 칸으로 선언했습니다.');
    for (const file of manifest.files) {
      assert.deepEqual(file, inventoryById.get(file.id), '전국 인벤토리와 지역 파일 불일치');
      if (tileHashes.has(file.sha256)) continue;
      decodeRoadTile(read(file.path, file.bytes), manifest, file, codecs);
      tileHashes.add(file.sha256);
      objects.push(object(`${NATIONAL_PREFIX}/tiles/${file.sha256}.json.gz`, file.path, file.bytes, file.sha256, 'application/gzip'));
    }
    objects.push(object(`${NATIONAL_PREFIX}/${relative}`, relative, body.length, region.manifest.sha256, 'application/json; charset=utf-8'));
  }
  assert.equal(tileHashes.size, inventory.files.length, '전국 원본 타일 중 지역 목록에서 빠진 파일이 있습니다. 공급 범위를 확인하세요.');
  const catalogHash = sha256(catalogBody);
  objects.push(object(`${NATIONAL_PREFIX}/catalogs/${catalogHash}.json`, 'catalog.json', catalogBody.length, catalogHash, 'application/json; charset=utf-8'));
  const notice = Buffer.from(`Running Art Korean road data\n${inventory.source.attribution}\nDatabase license: ODbL-1.0\nhttps://www.openstreetmap.org/copyright\nhttps://opendatacommons.org/licenses/odbl/1-0/\nSource: ${inventory.source.url}\nSource SHA-256: ${inventory.source.sha256}\nData timestamp: ${inventory.source.dataTimestamp}\nProcessing source: https://github.com/ssw3131/running-art-mobile/tree/main/scripts/road-data\nWhole OSM ways and IDs preserved; walking filter and 0.02-degree grid.\n`);
  const noticeHash = sha256(notice);
  objects.push({ key: `${NATIONAL_PREFIX}/attribution/${noticeHash}.txt`, body: notice, sha256: noticeHash,
    contentType: 'text/plain; charset=utf-8', cacheControl: IMMUTABLE_CACHE });
  const pointer = { format: 'running-art-national-channel', schemaVersion: 1, release: catalog.release,
    catalog: { bytes: catalogBody.length, sha256: catalogHash }, attribution: { bytes: notice.length, sha256: noticeHash } };
  const pointerBody = jsonBytes(pointer);
  return { directory: base, id: catalogHash, catalog, objects, current: { key: NATIONAL_CURRENT_KEY,
    body: pointerBody, sha256: sha256(pointerBody), contentType: 'application/json; charset=utf-8', cacheControl: CURRENT_CACHE } };
}

export function nationalPlan(bundle, config) {
  return { mode: 'plan', coverage: 'national', bundle: bundle.directory, regions: bundle.catalog.regions.length,
    objects: bundle.objects.length, bytes: bundle.objects.reduce((n, o) => n + o.body.length, 0),
    currentKey: NATIONAL_CURRENT_KEY, targetPointerSha256: bundle.current.sha256,
    bucket: config?.bucket, publicBaseUrl: config?.publicBaseUrl, developmentOnly: config?.publicUrlMode === 'r2-dev' };
}
