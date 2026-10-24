// TLS transport adapter for the real isolated backend; no mocked API responses.
import { createServer } from 'node:https';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { isolatedSupabase } from './isolated-supabase.mjs';
import { ANDROID_KEY } from './prepare-membership-fixture.mjs';
const { env, url } = isolatedSupabase();
const server = createServer({ key: readFileSync('.cache/qa-membership/tls/server.key'), cert: readFileSync('.cache/qa-membership/tls/server.crt') }, (req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); res.end('ready'); return; }
  if (!/^\/(rest|storage)\/v1\//.test(req.url ?? '') && !/^\/auth\/v1\/(token|user|logout)(?:\?|$)/.test(req.url ?? '')) { res.writeHead(404); res.end(); return; }
  if (req.headers.apikey !== ANDROID_KEY) { res.writeHead(403); res.end(); return; }
  const headers = { ...req.headers, host: url.host, apikey: env.ANON_KEY };
  // Translate only the test public-key alias, never the user's real signed JWT.
  if (headers.authorization === `Bearer ${ANDROID_KEY}`) headers.authorization = `Bearer ${env.ANON_KEY}`;
  delete headers.connection;
  const upstream = request({ hostname: url.hostname, port: url.port, path: req.url, method: req.method, headers, timeout: 30000 }, response => {
    res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.on('aborted', () => upstream.destroy()); req.pipe(upstream);
});
server.listen(54431, '127.0.0.1', () => console.log('Isolated Android TLS transport listening on loopback 54431'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
