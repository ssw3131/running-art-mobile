const COMPUTE_ORIGIN = 'https://runpen-route-compute-125644906792.asia-northeast3.run.app';
const MAX_REQUEST = 16384;
const roadPath = /^\/roads\/(?:national|samples)\/v1\/[a-z0-9/_\-.]+$/;

function error(status, message) {
  return Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } });
}

async function boundedBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_REQUEST) throw new Error('large');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new Error('body-timeout');
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST) throw new Error('large');
      chunks.push(value);
    }
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export function createHandler(fetcher = fetch) {
  return async function handle(request, env, ctx) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:') {
      url.protocol = 'https:';
      return Response.redirect(url.href, 308);
    }
    if (url.pathname.startsWith('/roads/')) {
      if (!['GET', 'HEAD'].includes(request.method)) return error(405, 'Method not allowed');
      if (url.search || !roadPath.test(url.pathname) || url.pathname.includes('..')) return error(404, 'Not found');
      const immutable = /\/[a-f0-9]{64}\.(?:json|json\.gz)$/.test(url.pathname);
      const cache = globalThis.caches?.default;
      const cacheKey = new Request(url.href);
      if (immutable && cache) {
        const hit = await cache.match(cacheKey);
        if (hit) return request.method === 'HEAD' ? new Response(null, hit) : hit;
      }
      const object = await env.ROADS.get(url.pathname.slice(1));
      if (!object) return error(404, 'Not found');
      const headers = new Headers();
      headers.set('content-type', url.pathname.endsWith('.gz') ? 'application/gzip' : 'application/json');
      headers.set('content-length', String(object.size));
      headers.set('etag', object.httpEtag);
      headers.set('cache-control', immutable ? 'public, max-age=31536000, immutable, no-transform' : 'no-cache, no-transform');
      headers.set('x-content-type-options', 'nosniff');
      // The gzip object is a file, not HTTP content-encoding. Preserve exact bytes.
      const response = new Response(object.body, { headers, encodeBody: 'manual' });
      if (immutable && cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return request.method === 'HEAD' ? new Response(null, { headers }) : response;
    }
    if (url.pathname.startsWith('/api/')) {
      if (url.search) return error(400, 'Query parameters are not supported');
      const health = url.pathname === '/api/health';
      const calculate = url.pathname === '/api/v1/routes';
      if (!health && !calculate) return error(404, 'Not found');
      if (request.method !== (health ? 'GET' : 'POST')) return error(405, 'Method not allowed');
      if (calculate && request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return error(415, 'Expected application/json');
      try {
        let body;
        if (calculate) body = await boundedBody(request);
        const upstream = await fetcher(`${COMPUTE_ORIGIN}${url.pathname.slice(4)}`, {
          method: request.method, headers: { 'content-type': 'application/json', accept: 'application/json' },
          body, redirect: 'manual', signal: AbortSignal.any([request.signal, AbortSignal.timeout(70000)]),
        });
        if (upstream.status >= 300 && upstream.status < 400) return error(502, 'Unexpected upstream redirect');
        const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        const retry = upstream.headers.get('retry-after');
        if (retry) headers.set('retry-after', retry);
        return new Response(upstream.body, { status: upstream.status, headers });
      } catch (e) {
        return error(e.message === 'large' ? 413 : e.message === 'body-timeout' ? 408 : 502, 'Request could not be completed');
      }
    }
    return env.ASSETS.fetch(request);
  };
}

export default { fetch: createHandler() };
