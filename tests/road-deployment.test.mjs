import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { sha256 } from '../scripts/road-data/common.mjs';
import { prepareBundle, loadBundle, validateConfig, jsonBytes, CURRENT_KEY } from '../scripts/road-data/deployment.mjs';
import { uploadBundle, promoteBundle, verifyPublic, currentState, readPublic, collectBytes } from '../scripts/road-data/publish.mjs';
import { createR2Store } from '../scripts/road-data/r2-store.mjs';

function fixture(t, release = 'test-a') {
  const parent = path.resolve('.cache/road-deployment-tests');
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'case-'));
  t.after(() => {
    assert.ok(path.resolve(directory).startsWith(parent + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const input = path.join(directory, 'input');
  fs.mkdirSync(path.join(input, 'tiles'), { recursive: true });
  const id = '1850_6350', bounds = [37, 127, 37.02, 127.02];
  const tile = { format: 'running-art-road-tile', schemaVersion: 1, release, id, bounds, coordinateOrder: 'lat,lon',
    elements: [{ type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'residential' },
      geometry: [{ lat: 37.001, lon: 127.001 }, { lat: 37.019, lon: 127.019 }] }] };
  const decoded = jsonBytes(tile), packed = gzipSync(decoded);
  const file = { id, bounds, path: `tiles/${id}.json.gz`, encoding: 'gzip', bytes: packed.length,
    sha256: sha256(packed), decodedBytes: decoded.length, decodedSha256: sha256(decoded), ways: 1 };
  const manifest = { format: 'running-art-road-manifest', schemaVersion: 1, release, coverage: 'samples',
    coordinateOrder: 'lat,lon', gridStepE7: 200000,
    source: { sha256: 'a'.repeat(64), dataTimestamp: '2026-09-29T20:22:51Z',
      url: 'https://download.geofabrik.de/asia/south-korea-260929.osm.pbf', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors' }, files: [file] };
  fs.writeFileSync(path.join(input, file.path), packed);
  fs.writeFileSync(path.join(input, 'manifest.json'), jsonBytes(manifest));
  return { input, directory, manifest, bundle: prepareBundle(input, path.join(directory, 'output')) };
}

function memoryStore() {
  const objects = new Map();
  let sequence = 0;
  return { objects,
    async get(key, limit) {
      const object = objects.get(key);
      if (object) assert.ok(object.body.length <= limit, '원격 응답 크기 초과');
      return object ? { ...object, body: Buffer.from(object.body) } : null;
    },
    async put(object, condition) {
      const previous = objects.get(object.key);
      if ((condition.ifNoneMatch === '*' && previous) || (condition.ifMatch && previous?.etag !== condition.ifMatch)) {
        throw Object.assign(new Error('PreconditionFailed'), { status: 412 });
      }
      objects.set(object.key, { ...object, body: Buffer.from(object.body), etag: `"revision-${++sequence}"` });
    },
  };
}

async function serve(t, store) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const isS3 = req.url.startsWith('/sample-bucket/');
    const key = decodeURIComponent(req.url.split('?')[0].slice(isS3 ? '/sample-bucket/'.length : 1));
    requests.push({ method: req.method, key, headers: req.headers, isS3 });
    try {
      if (req.method === 'PUT' && isS3) {
        const body = await collectBytes(req, 2 * 1024 * 1024);
        await store.put({ key, body, contentType: req.headers['content-type'], cacheControl: req.headers['cache-control'],
          contentEncoding: req.headers['content-encoding'] }, { ifMatch: req.headers['if-match'], ifNoneMatch: req.headers['if-none-match'] });
        res.writeHead(200, { etag: store.objects.get(key).etag }); res.end(); return;
      }
      const object = store.objects.get(key);
      if (!object) {
        res.writeHead(404, { 'content-type': 'application/xml' });
        res.end('<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>'); return;
      }
      res.writeHead(200, { 'content-type': object.contentType, 'cache-control': object.cacheControl,
        'content-length': object.body.length, etag: object.etag,
        ...(object.contentEncoding ? { 'content-encoding': object.contentEncoding } : {}),
        ...(object.extraHeaders ?? {}) });
      res.end(object.body);
    } catch (error) {
      res.writeHead(error.status ?? 500, { 'content-type': 'application/xml' });
      res.end(`<Error><Code>${error.status === 412 ? 'PreconditionFailed' : 'InternalError'}</Code></Error>`);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, requests };
}
const local = { allowLoopback: true };

test('bundle is deterministic, preserves gzip bytes and rejects corrupt or missing input', t => {
  const f = fixture(t);
  assert.equal(prepareBundle(f.input, path.join(f.directory, 'output')).id, f.bundle.id);
  assert.equal(f.bundle.objects.length, 3);
  assert.equal(f.bundle.objects.at(-1).relative, 'manifest.json');
  assert.equal(f.bundle.pointer.coverage, 'samples');
  assert.match(f.bundle.id, new RegExp(sha256(fs.readFileSync(path.join(f.input, 'manifest.json')))));
  fs.appendFileSync(path.join(f.input, f.manifest.files[0].path), 'bad');
  assert.throws(() => prepareBundle(f.input, path.join(f.directory, 'output')), /크기/);
  fs.unlinkSync(path.join(f.input, f.manifest.files[0].path));
  assert.throws(() => prepareBundle(f.input, path.join(f.directory, 'output')), /ENOENT/);
});

test('bundle loader rejects notice mutation and path traversal before publishing', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.bundle.directory, 'ATTRIBUTION.txt'), 'incorrect notice');
  assert.throws(() => loadBundle(f.bundle.directory), /출처/);
  f.manifest.files[0].path = '../../outside.json.gz';
  fs.writeFileSync(path.join(f.input, 'manifest.json'), jsonBytes(f.manifest));
  assert.throws(() => prepareBundle(f.input, path.join(f.directory, 'output')), /PATH/);
});

test('partial upload keeps current intact, retry reuses valid objects, conflicts are rejected', async t => {
  const { bundle } = fixture(t), store = memoryStore();
  const put = store.put;
  let writes = 0;
  store.put = async (...args) => { if (++writes === 2) throw new Error('simulated interruption'); return put(...args); };
  await assert.rejects(uploadBundle(bundle, store), /interruption/);
  assert.equal(store.objects.has(CURRENT_KEY), false);
  store.put = put;
  assert.deepEqual(await uploadBundle(bundle, store), { uploaded: 2, reused: 1, currentChanged: false });
  assert.deepEqual(await uploadBundle(bundle, store), { uploaded: 0, reused: 3, currentChanged: false });
  store.objects.get(bundle.objects[0].key).body[0] ^= 1;
  await assert.rejects(uploadBundle(bundle, store), /해시/);
});

test('upload racing with another identical writer verifies content after 412', async t => {
  const { bundle } = fixture(t), store = memoryStore();
  const put = store.put;
  store.put = async (object, condition) => {
    await put(object, condition);
    throw Object.assign(new Error('race'), { status: 412 });
  };
  assert.deepEqual(await uploadBundle(bundle, store), { uploaded: 0, reused: 3, currentChanged: false });
});

test('HTTP verification checks gzip, missing files, types and cache policy', async t => {
  const { bundle } = fixture(t), store = memoryStore();
  await uploadBundle(bundle, store);
  const { baseUrl } = await serve(t, store);
  assert.equal((await verifyPublic(bundle, baseUrl, local)).objects, 3);
  await assert.rejects(verifyPublic(bundle, baseUrl), /HTTPS/);
  const object = store.objects.get(bundle.objects[0].key);
  object.contentEncoding = 'gzip';
  await assert.rejects(verifyPublic(bundle, baseUrl, local), /Content-Encoding/);
  delete object.contentEncoding;
  object.cacheControl = 'public, max-age=60';
  await assert.rejects(verifyPublic(bundle, baseUrl, local), /Cache-Control/);
  object.cacheControl = bundle.objects[0].cacheControl;
  object.contentType = 'application/json';
  await assert.rejects(verifyPublic(bundle, baseUrl, local), /Content-Type/);
  store.objects.delete(bundle.objects[0].key);
  await assert.rejects(verifyPublic(bundle, baseUrl, local), /HTTP 404/);
  assert.equal(store.objects.has(CURRENT_KEY), false);
});

test('missing public data or changed current prevents promotion', async t => {
  const { bundle } = fixture(t), store = memoryStore();
  await uploadBundle(bundle, store);
  const emptyPublicStore = memoryStore();
  const { baseUrl } = await serve(t, emptyPublicStore);
  await assert.rejects(promoteBundle(bundle, store, baseUrl, 'absent', local), /HTTP 404/);
  assert.equal(store.objects.has(CURRENT_KEY), false);
  await assert.rejects(promoteBundle(bundle, store, baseUrl, 'b'.repeat(64), local), /현재 버전이/);
});

test('concurrent pointer write during verification fails CAS without overwriting winner', async t => {
  const a = fixture(t, 'test-a').bundle, b = fixture(t, 'test-b').bundle;
  const store = memoryStore();
  await uploadBundle(a, store);
  const { baseUrl } = await serve(t, store);
  const put = store.put;
  store.put = async (object, condition) => {
    if (object.key === CURRENT_KEY) await put(b.current, { ifNoneMatch: '*' });
    return put(object, condition);
  };
  await assert.rejects(promoteBundle(a, store, baseUrl, 'absent', local), /PreconditionFailed/);
  assert.equal((await currentState(store)).sha256, b.current.sha256);
});

test('real SDK wire requests upload, promote, update and roll back via a local S3/HTTP fixture', async t => {
  const a = fixture(t, 'test-a').bundle, b = fixture(t, 'test-b').bundle;
  const backing = memoryStore(), { baseUrl, requests } = await serve(t, backing);
  const client = new S3Client({ region: 'auto', endpoint: baseUrl, forcePathStyle: true,
    credentials: { accessKeyId: 'local-test', secretAccessKey: 'local-test-secret' }, maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const store = createR2Store({ bucket: 'sample-bucket' },
    { ROAD_R2_ACCESS_KEY_ID: 'local-test', ROAD_R2_SECRET_ACCESS_KEY: 'local-test-secret' }, client);
  t.after(() => store.close());
  assert.equal((await currentState(store)).sha256, 'absent');
  await uploadBundle(a, store);
  await promoteBundle(a, store, baseUrl, 'absent', local);
  await uploadBundle(b, store);
  await promoteBundle(b, store, baseUrl, a.current.sha256, local);
  await promoteBundle(a, store, baseUrl, b.current.sha256, local);
  assert.equal((await currentState(store)).sha256, a.current.sha256);
  assert.equal(backing.objects.size, 7);
  assert.ok(requests.filter(r => r.isS3).every(r => r.headers.authorization?.startsWith('AWS4-HMAC-SHA256')));
  const puts = requests.filter(r => r.method === 'PUT');
  assert.ok(puts.every(r => !r.headers['content-encoding'] && (r.headers['if-match'] || r.headers['if-none-match'] === '*')));
  assert.equal(puts.filter(r => r.key === CURRENT_KEY && r.headers['if-match']).length, 2);
});

test('post-write stale CDN is reported as a partial failure; no unsafe automatic rollback', async t => {
  const { bundle } = fixture(t), store = memoryStore();
  await uploadBundle(bundle, store);
  const { baseUrl } = await serve(t, store);
  const put = store.put;
  store.put = async (...args) => {
    await put(...args);
    if (args[0].key === CURRENT_KEY) store.objects.get(CURRENT_KEY).extraHeaders = { 'cf-cache-status': 'HIT', age: '60' };
  };
  await assert.rejects(promoteBundle(bundle, store, baseUrl, 'absent', local), /포인터 쓰기 후 검증 실패/);
  assert.equal((await currentState(store)).sha256, bundle.current.sha256);
});

test('stream and redirect safeguards reject oversized or redirected responses', async t => {
  await assert.rejects(collectBytes(Readable.from([Buffer.alloc(6), Buffer.alloc(6)]), 10), /크기/);
  const { bundle } = fixture(t);
  let seen;
  await assert.rejects(readPublic('https://roads.example.com', bundle.objects[0], {
    fetchImpl: async (_url, options) => { seen = options; return new Response('redirect', { status: 302 }); },
  }), /HTTP 302/);
  assert.equal(seen.redirect, 'error');
});

test('deployment config requires independent HTTPS origin and explicit credentials', () => {
  const valid = { schemaVersion: 1, accountId: 'a'.repeat(32), bucket: 'sample-bucket', publicBaseUrl: 'https://roads.example.com' };
  assert.equal(validateConfig(valid).publicBaseUrl, valid.publicBaseUrl);
  for (const publicBaseUrl of ['http://roads.example.com', 'https://pub-1.r2.dev', 'https://roads.example.com/path', 'https://user:pass@roads.example.com']) {
    assert.throws(() => validateConfig({ ...valid, publicBaseUrl }));
  }
  assert.throws(() => createR2Store(valid, {}), /ROAD_R2_ACCESS_KEY_ID/);
});

test('CLI upload without apply produces plan without network credentials', t => {
  const { bundle } = fixture(t);
  const result = spawnSync(process.execPath, ['scripts/road-data/deploy.mjs', 'upload', '--bundle', bundle.directory], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, 'plan');
  assert.equal(plan.configured, false);
  assert.equal(plan.targetPointerSha256, bundle.current.sha256);
});
