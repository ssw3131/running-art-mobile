import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServerRoads } from '../server/route-compute/roads.mjs';
import { createRemoteCalculation } from '../src/modules/route-compute/client.ts';

const root = 'https://runpen.alohalab.co.kr';
const previous = 'https://pub-5944210ae37a4e4987dea14ae0f41905.r2.dev';
const results = { at: new Date().toISOString(), checks: [], roads: [] };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir('test-results/domains', { recursive: true });
try {
  for (const [path, status] of [['/',200],['/share/',200],['/api/health',200],['/missing',404],['/api/missing',404],['/roads/private.json',404],['/policies/privacy',404]]) {
    const r = await fetch(root + path, { redirect: 'error' });
    assert.equal(r.status, status, path);
    if (path === '/share/') {
      assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
      assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    }
    await r.arrayBuffer();
    results.checks.push({ path, status });
  }
  for (const file of ['index.html','app.js','style.css','model.js','map-provider.js','config.json']) {
    const r = await fetch(`${root}/share/${file}`, { redirect: 'follow' });
    assert.equal(r.status, 200);
    const bytes = new Uint8Array(await r.arrayBuffer());
    assert.equal(hash(bytes), hash(await readFile(`build/run-share-web/${file}`)), file);
    results.checks.push({ asset: file, sha256: hash(bytes) });
  }
  const pointerPath = '/roads/national/v1/current.json';
  const [current, old] = await Promise.all([fetch(root + pointerPath), fetch(previous + pointerPath)]);
  assert.equal(current.headers.get('content-encoding'), null);
  const data = new Uint8Array(await current.arrayBuffer());
  assert.equal(data.length, Number(current.headers.get('content-length')));
  assert.equal(hash(data), hash(new Uint8Array(await old.arrayBuffer())));
  results.checks.push({ pointerSha256: hash(data), length: data.length });

  const newRoads = await createServerRoads(root);
  const oldRoads = await createServerRoads(previous);
  for (const [id, origin] of [['gangnam',{lat:37.4979,lng:127.0276}], ['busan',{lat:35.1796,lng:129.0756}], ['boundary',{lat:37.48,lng:126.88}]]) {
    const request = { origin, options: { radiusKm: 2 }, refresh: false };
    const a = await newRoads(request, AbortSignal.timeout(90000));
    const b = await oldRoads(request, AbortSignal.timeout(90000));
    assert.equal(hash(JSON.stringify(a.elements)), hash(JSON.stringify(b.elements)), id);
    const cached = await newRoads(request, AbortSignal.timeout(90000));
    assert.equal(hash(JSON.stringify(a.elements)), hash(JSON.stringify(cached.elements)));
    assert.equal(cached.downloaded, 0);
    results.roads.push({ id, elements: a.elements.length, sha256: hash(JSON.stringify(a.elements)), downloadedOnRepeat: cached.downloaded, reused: cached.reused });
    console.log('Verified roads', id);
  }
  const invalid = await fetch(root + '/api/v1/routes', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' });
  assert.equal(invalid.status, 400);
  const oversized = await fetch(root + '/api/v1/routes', { method:'POST', headers:{'content-type':'application/json'}, body:'x'.repeat(16385) });
  assert.equal(oversized.status, 413);
  const input = { origin: {lat:37.4979,lng:127.0276}, options: {version:'0.2',mode:'free-loop',shape:'heart',targetKm:3,radiusKm:2}, elements:[] };
  const result = await createRemoteCalculation(root + '/api')(input, AbortSignal.timeout(90000), false);
  results.compute = { candidates: result.result.candidates.length, sha256: hash(JSON.stringify(result.result)), timing: result.timing };
  assert.equal(result.result.candidates.length, 5);
  results.pass = true;
  console.log(JSON.stringify(results, null, 2));
} finally { await writeFile('test-results/domains/live.json', JSON.stringify(results, null, 2)); }
