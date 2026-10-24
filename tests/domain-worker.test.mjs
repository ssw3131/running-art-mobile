import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { createHandler } from '../infra/domains/runpen-worker.mjs';

const origin = 'https://runpen.alohalab.co.kr';
const req = (path, init) => new Request(origin + path, init);
const ctx = { waitUntil: promise => promise };

test('domain roads preserve gzip bytes, content length and immutable hash cache policy', async () => {
  const bytes = gzipSync('road fixture');
  let key;
  const env = { ROADS: { get: async k => { key = k; return { body: bytes, size: bytes.length, httpEtag: '"fixture"' }; } } };
  const path = `/roads/national/v1/tiles/${'a'.repeat(64)}.json.gz`;
  const response = await createHandler()(req(path), env, ctx);
  assert.equal(key, path.slice(1));
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('content-type'), 'application/gzip');
  assert.equal(response.headers.get('content-length'), String(bytes.length));
  assert.match(response.headers.get('cache-control'), /immutable.*no-transform/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  const head = await createHandler()(req(path, { method: 'HEAD' }), env, ctx);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  const current = await createHandler()(req('/roads/national/v1/current.json'), env, ctx);
  assert.equal(current.headers.get('cache-control'), 'no-cache, no-transform');
});

test('domain roads never permit writes, arbitrary keys, query strings or cached misses', async () => {
  let reads = 0;
  const env = { ROADS: { get: async () => { reads++; return null; } } };
  for (const path of ['/roads/private.json', '/roads/national/v1/current.json?url=https://evil.test', '/roads/national/v1/%2Fsecret']) {
    assert.equal((await createHandler()(req(path), env, ctx)).status, 404);
  }
  assert.equal((await createHandler()(req('/roads/national/v1/current.json', { method: 'PUT' }), env, ctx)).status, 405);
  assert.equal(reads, 0);
  const miss = await createHandler()(req('/roads/national/v1/current.json'), env, ctx);
  assert.equal(miss.status, 404);
  assert.equal(miss.headers.get('cache-control'), 'no-store');
});

test('domain compute forwards member authorization and operation only to the fixed calculation endpoint', async () => {
  let sent;
  const handle = createHandler(async (url, init) => {
    sent = { url, init };
    return new Response('{"error":"busy"}', { status: 429, headers: { 'retry-after': '60' } });
  });
  const response = await handle(req('/api/v1/routes', { method: 'POST', headers: {
    'content-type': 'application/json', authorization: 'Bearer private', cookie: 'private=true',
    'x-operation-id': 'a9c174e0-0671-4f81-a2c4-a66051820a27', apikey: 'unrelated',
  }, body: '{"origin":"fixture"}' }), {}, ctx);
  assert.equal(sent.url, 'https://runpen-route-compute-125644906792.asia-northeast3.run.app/v1/routes');
  assert.deepEqual(sent.init.headers, {accept: 'application/json', 'content-type': 'application/json',
    authorization: 'Bearer private', 'x-operation-id': 'a9c174e0-0671-4f81-a2c4-a66051820a27'});
  assert.equal(new TextDecoder().decode(sent.init.body), '{"origin":"fixture"}');
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(sent.init.redirect, 'manual');
  await handle(req('/api/health', {headers:{authorization:'Bearer private',cookie:'private=true','x-operation-id':'unused'}}),{},ctx);
  assert.deepEqual(Object.keys(sent.init.headers).sort(), ['accept', 'content-type']);
});

test('domain compute rejects oversize streamed bodies, wrong methods and arbitrary proxy destinations', async () => {
  let calls = 0;
  const handle = createHandler(async () => { calls++; return new Response('{}'); });
  const cases = [
    [req('/api/other'), 404], [req('/api/v1/routes'), 405],
    [req('/api/health?url=https://evil.test'), 400],
    [req('/api/v1/routes', { method: 'POST', body: '{}' }), 415],
    [req('/api/v1/routes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(16385) }), 413],
  ];
  for (const [request, status] of cases) assert.equal((await handle(request, {}, ctx)).status, status);
  assert.equal(calls, 0);
  const redirect = await createHandler(async () => Response.redirect('https://evil.test'))(req('/api/health'), {}, ctx);
  assert.equal(redirect.status, 502);
});

test('domain static assets keep fragments client-side and HTTPS redirect preserves path', async () => {
  let path;
  const env = { ASSETS: { fetch: async request => { path = new URL(request.url).pathname; return new Response('viewer'); } } };
  assert.equal(await (await createHandler()(req('/share/'), env, ctx)).text(), 'viewer');
  assert.equal(path, '/share/');
  const redirect = await createHandler()(new Request('http://runpen.alohalab.co.kr/api/health'), env, ctx);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), origin + '/api/health');
});
