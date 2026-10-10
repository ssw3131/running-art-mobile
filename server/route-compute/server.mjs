import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { COMPUTE_CONTRACT, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, parseComputeRequest } from '../../src/modules/route-compute/contract.ts';
import { createComputePool, ServiceError } from './pool.mjs';
import { createAdmissionGuard, createIngressGate } from './admission.mjs';
import { createGcsAdmissionStore } from './admission-store.mjs';

export function createComputeServer(pool = createComputePool(), { admission, ingress = createIngressGate(), report = () => {} } = {}) {
  let occupied = false, stopping = false, lastRejection = -Infinity;
  const server = http.createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    const reply = (status, value, retryAfter = 5) => {
      if (res.destroyed) return;
      const body = JSON.stringify(value);
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', ...(status === 429 || status === 503 ? { 'retry-after': String(retryAfter) } : {}) });
      res.end(body);
      // Bounded rejection logs contain no request bodies, locations, IPs or URLs.
      if ((status === 429 || status >= 500) && Date.now() - lastRejection >= 30000) {
        lastRejection = Date.now();
        report({ severity: 'WARNING', event: 'compute_rejected', reason: value.error, status });
      }
    };
    if (req.method === 'GET' && req.url === '/healthz') return reply(200, { contract: COMPUTE_CONTRACT, ok: true });
    if (req.method !== 'POST' || req.url !== '/v1/routes') return reply(404, { error: 'not_found' });
    if (stopping) return reply(503, { error: 'stopping' });
    try { ingress(); } catch (error) { return reply(error.status, { error: error.code }, error.retryAfter); }
    if (occupied) return reply(429, { error: 'busy' });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json' || req.headers['content-encoding']) return reply(415, { error: 'content_type' });
    if (req.headers['content-length'] && (!/^\d+$/.test(req.headers['content-length']) || Number(req.headers['content-length']) > MAX_REQUEST_BYTES)) return reply(413, { error: 'request_size' });
    occupied = true;
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', disconnect);
    // Includes slow body uploads and stops the worker even when a proxy doesn't
    // immediately propagate a mobile disconnect.
    const timer = setTimeout(() => { controller.abort(); reply(408, { error: 'timeout' }); req.destroy(); }, 65000);
    const bodyTimer = setTimeout(() => { controller.abort(); reply(408, { error: 'timeout' }); req.destroy(); }, 5000);
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_REQUEST_BYTES) throw new ServiceError(413, 'request_size');
        chunks.push(chunk);
      }
      clearTimeout(bodyTimer);
      let request;
      try { request = parseComputeRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { throw new ServiceError(400, 'invalid_request'); }
      if (admission) await admission.reserve(AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]));
      if (controller.signal.aborted) throw new ServiceError(499, 'cancelled');
      report({ severity: 'INFO', event: 'compute_admitted' });
      const value = await pool.run(request, controller.signal);
      if (Buffer.byteLength(JSON.stringify(value)) > MAX_RESPONSE_BYTES) throw new ServiceError(503, 'response_size');
      reply(200, value);
    } catch (error) {
      if (!controller.signal.aborted) {
        const admissionTimeout = error instanceof ServiceError && error.status === 499;
        reply(admissionTimeout ? 503 : error instanceof ServiceError ? error.status : 503,
          { error: admissionTimeout ? 'guard_unavailable' : error instanceof ServiceError ? error.code : 'unavailable' }, error.retryAfter ?? 5);
      }
    } finally {
      clearTimeout(timer); clearTimeout(bodyTimer); res.removeListener('close', disconnect); occupied = false;
    }
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.drain = () => { stopping = true; server.close(); };
  server.on('close', () => { void pool.close(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bucket = process.env.COMPUTE_GUARD_BUCKET;
  // A Cloud Run deployment must never silently run without the shared guard.
  if (process.env.K_SERVICE && !bucket) throw new Error('COMPUTE_GUARD_BUCKET is required on Cloud Run');
  const admission = bucket ? createAdmissionGuard({ store: createGcsAdmissionStore({ bucket }) }) : undefined;
  const server = createComputeServer(createComputePool(), { admission, report: value => console.info(JSON.stringify(value)) });
  server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0', () => console.info(JSON.stringify({ event: 'ready', contract: COMPUTE_CONTRACT })));
  process.once('SIGTERM', () => { server.drain(); setTimeout(() => process.exit(0), 8000).unref(); });
}
