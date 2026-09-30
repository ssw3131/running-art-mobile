import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateManifest, decodeRoadTile } from '../../src/modules/road-data/file-format.ts';
import { codecs, sha256 } from './common.mjs';

export const PREFIX = 'roads/samples/v1';
export const CURRENT_KEY = `${PREFIX}/current.json`;
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable, no-transform';
export const CURRENT_CACHE = 'no-store, no-transform';
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

function readWithin(directory, relative, maxBytes) {
  const base = fs.realpathSync(directory);
  const filename = fs.realpathSync(path.join(base, relative));
  assert.ok(filename.startsWith(base + path.sep), '배포 입력 경로가 폴더 밖을 가리킵니다.');
  assert.ok(fs.statSync(filename).size <= maxBytes, '배포 입력 크기 초과');
  return fs.readFileSync(filename);
}

export function readSource(directory) {
  const body = readWithin(directory, 'manifest.json', MAX_MANIFEST_BYTES);
  const manifest = JSON.parse(codecs.utf8(body));
  validateManifest(manifest);
  assert.equal(manifest.gridStepE7, 200000, '현재 배포 준비는 잠정 0.02도 표본만 지원합니다.');
  assert.ok(manifest.files.length <= 400 && manifest.files.reduce((n, file) => n + file.bytes, 0) <= 64 * 1024 * 1024,
    '표본 배포 한도(400개/64MiB) 초과. 전국 배포 도구는 별도 단계입니다.');
  const tiles = manifest.files.map(file => {
    const data = readWithin(directory, file.path, file.bytes);
    decodeRoadTile(data, manifest, file, codecs);
    return { relative: file.path, body: data, contentType: 'application/gzip' };
  });
  return { manifest, body, tiles };
}

function attribution(manifest) {
  return Buffer.from([
    'Running Art — public road samples (not nationwide coverage)',
    '© OpenStreetMap contributors; extract by Geofabrik',
    'Database license: Open Database License (ODbL) 1.0',
    'https://www.openstreetmap.org/copyright',
    'https://opendatacommons.org/licenses/odbl/1-0/',
    `Source: ${manifest.source.url}`,
    `Source SHA-256: ${manifest.source.sha256}`,
    `Data timestamp: ${manifest.source.dataTimestamp}`,
    'Processing: scripts/road-data/ (extract.py, package.mjs, deployment.mjs)',
    'Processing source: https://github.com/ssw3131/running-art-mobile',
    'Public highway ways, walking filter, whole ways preserved across grid boundaries.',
    'Keep this notice with copies of the data. Mobile format is provisional.',
    '',
  ].join('\n'));
}

export function loadBundle(directory) {
  const { manifest, body, tiles } = readSource(directory);
  const notice = readWithin(directory, 'ATTRIBUTION.txt', 16384);
  assert.deepEqual(notice, attribution(manifest), '출처 안내가 현재 배포 계약과 다릅니다.');
  const manifestSha256 = sha256(body);
  const id = `${manifest.release}-g${manifest.gridStepE7}-${manifestSha256}`;
  const releasePrefix = `${PREFIX}/releases/${id}`;
  const objects = [...tiles, { relative: 'ATTRIBUTION.txt', body: notice, contentType: 'text/plain; charset=utf-8' },
    { relative: 'manifest.json', body, contentType: 'application/json; charset=utf-8' }]
    .map(item => ({ ...item, key: `${releasePrefix}/${item.relative}`, sha256: sha256(item.body), cacheControl: IMMUTABLE_CACHE }));
  const pointer = { format: 'running-art-road-channel', schemaVersion: 1, coverage: 'samples',
    release: manifest.release, gridStepE7: manifest.gridStepE7,
    manifest: { key: `${releasePrefix}/manifest.json`, bytes: body.length, sha256: manifestSha256 },
    attribution: { key: `${releasePrefix}/ATTRIBUTION.txt`, bytes: notice.length, sha256: sha256(notice) } };
  const pointerBody = jsonBytes(pointer);
  return { directory: path.resolve(directory), id, manifest, objects, pointer,
    current: { key: CURRENT_KEY, body: pointerBody, sha256: sha256(pointerBody),
      contentType: 'application/json; charset=utf-8', cacheControl: CURRENT_CACHE } };
}

export function prepareBundle(input, output) {
  const { manifest, body, tiles } = readSource(input);
  const id = `${manifest.release}-g${manifest.gridStepE7}-${sha256(body)}`;
  const directory = path.join(output, id);
  // Never overwrite a previous candidate; reruns must match every byte.
  for (const item of [...tiles, { relative: 'manifest.json', body }, { relative: 'ATTRIBUTION.txt', body: attribution(manifest) }]) {
    const filename = path.join(directory, item.relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    try { fs.writeFileSync(filename, item.body, { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      assert.deepEqual(fs.readFileSync(filename), item.body, '같은 배포 묶음의 파일 충돌');
    }
  }
  return loadBundle(directory);
}

export function validateConfig(config) {
  assert.equal(config.schemaVersion, 1, '배포 설정 버전 오류');
  assert.match(config.accountId ?? '', /^[a-f0-9]{32}$/, '전용 Cloudflare accountId 필요');
  assert.match(config.bucket ?? '', /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, '전용 R2 bucket 필요');
  const url = new URL(config.publicBaseUrl);
  assert.ok(url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    url.pathname === '/' && !url.search && !url.hash && url.hostname.includes('.') &&
    !url.hostname.endsWith('.r2.dev') && !url.hostname.endsWith('.r2.cloudflarestorage.com') &&
    !url.hostname.endsWith('.invalid'), '버킷에 연결된 전용 HTTPS 도메인을 지정하세요.');
  return { accountId: config.accountId, bucket: config.bucket, publicBaseUrl: url.origin };
}

export function deploymentPlan(bundle, config) {
  return { mode: 'plan', coverage: 'samples', provisional: true, configured: Boolean(config),
    bucket: config?.bucket ?? null, publicBaseUrl: config?.publicBaseUrl ?? null,
    bundle: bundle.directory, releaseId: bundle.id, objects: bundle.objects.length,
    bytes: bundle.objects.reduce((n, file) => n + file.body.length, 0),
    immutablePrefix: `${PREFIX}/releases/${bundle.id}`, currentKey: CURRENT_KEY,
    targetPointerSha256: bundle.current.sha256,
    headers: { tiles: { contentType: 'application/gzip', contentEncoding: null, cacheControl: IMMUTABLE_CACHE },
      current: { cacheControl: CURRENT_CACHE } },
    sequence: ['upload immutable objects', 'verify public HTTP bytes and headers', 'compare-and-swap current.json', 'verify public current.json'] };
}
