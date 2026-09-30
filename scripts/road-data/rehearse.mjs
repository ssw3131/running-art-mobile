// Explicit local rehearsal; never contacts R2 or reads cloud credentials.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { prepareBundle, CURRENT_KEY } from './deployment.mjs';
import { uploadBundle, promoteBundle, verifyPublic, collectBytes } from './publish.mjs';
import { readJson, writeJson, sha256, codecs } from './common.mjs';
import { selectRoadFiles, decodeRoadTile, mergeRoadTiles } from '../../src/modules/road-data/file-format.ts';
import { buildGraph } from '../../src/modules/route-engine/engine.ts';

const bundle = prepareBundle('build/road-data/grid-200000', 'build/road-deploy');
const objects = new Map();
let revision = 0;
const store = {
  async get(key, limit) {
    const value = objects.get(key);
    if (value) assert.ok(value.body.length <= limit);
    return value ?? null;
  },
  async put(value, condition) {
    const previous = objects.get(value.key);
    if ((condition.ifNoneMatch === '*' && previous) || (condition.ifMatch && previous?.etag !== condition.ifMatch)) {
      throw Object.assign(new Error('PreconditionFailed'), { status: 412 });
    }
    objects.set(value.key, { ...value, etag: `"local-${++revision}"` });
  },
};
const server = http.createServer((req, res) => {
  const object = objects.get(req.url.slice(1));
  if (req.method !== 'GET' || !object) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': object.contentType, 'cache-control': object.cacheControl,
    'content-length': object.body.length, etag: object.etag });
  res.end(object.body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
async function download(key, limit) {
  const response = await fetch(`${baseUrl}/${key}`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  return collectBytes(response.body, limit);
}
try {
  const upload = await uploadBundle(bundle, store);
  assert.equal(objects.has(CURRENT_KEY), false);
  const retry = await uploadBundle(bundle, store);
  const publicResult = await verifyPublic(bundle, baseUrl, { allowLoopback: true });
  const promotion = await promoteBundle(bundle, store, baseUrl, 'absent', { allowLoopback: true });
  const pointerBytes = await download(CURRENT_KEY, bundle.current.body.length);
  assert.equal(sha256(pointerBytes), bundle.current.sha256);
  const pointer = JSON.parse(pointerBytes);
  const manifestBytes = await download(pointer.manifest.key, pointer.manifest.bytes);
  assert.equal(sha256(manifestBytes), pointer.manifest.sha256);
  const manifest = JSON.parse(manifestBytes);
  const prefix = pointer.manifest.key.slice(0, -'manifest.json'.length);
  const config = readJson('scripts/road-data/samples.json');
  const samples = [];
  for (const sample of config.samples) {
    const reference = readJson(path.join('build/road-data/references', `${sample.id}.json`));
    const files = selectRoadFiles(manifest, reference.bounds), tiles = [];
    for (const file of files) tiles.push(decodeRoadTile(await download(prefix + file.path, file.bytes), manifest, file, codecs));
    const elements = mergeRoadTiles(manifest, tiles, reference.bounds);
    assert.deepEqual(elements, reference.elements);
    const graph = buildGraph(elements, sample.origin, config.radiusMeters);
    assert.deepEqual(graph, buildGraph(reference.elements, sample.origin, config.radiusMeters));
    samples.push({ id: sample.id, files: files.length, ways: elements.length, nodes: graph.nodes.length,
      edges: graph.edges.length, inputSha256: sha256(JSON.stringify(elements)), inputEqual: true, graphEqual: true });
  }
  const report = { recordedAt: new Date().toISOString(), runtime: process.version, environment: 'local-mock-store-and-loopback-http',
    realR2Verified: false, realCdnVerified: false, phoneTested: false,
    releaseId: bundle.id, manifestSha256: bundle.pointer.manifest.sha256,
    immutableObjects: publicResult.objects, immutableBytes: publicResult.bytes,
    pointerBytes: bundle.current.body.length, upload, retry, promotion, samples };
  writeJson('build/road-deploy/rehearsal-report.json', report);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
