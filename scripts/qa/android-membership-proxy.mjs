// TLS transport adapter for the real isolated backend; no mocked API responses.
import { createServer } from 'node:https';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { isolatedSupabase } from './isolated-supabase.mjs';
import { ANDROID_KEY } from './prepare-membership-fixture.mjs';
import { createUsageBackend } from '../../supabase/functions/_shared/usage-backend.ts';
import { createUsageHandler } from '../../supabase/functions/usage/handler.ts';
import { createComputeServer } from '../../server/route-compute/server.mjs';
import { response } from '../../tests/helpers/compute-contract.mjs';
const { env, url } = isolatedSupabase();
const usage = createUsageBackend({url:url.href,serviceKey:env.SERVICE_ROLE_KEY,identityKey:'isolated-android-usage-key-never-production'});
const handler = createUsageHandler(usage);
// The production HTTP handler and engine run on a public deterministic grid.
// Only road sourcing is replaced; Auth, membership, ledger and app calls are real.
const compute = createComputeServer({run:async (input,signal)=>{
  // The 7 km scenario explicitly cancels an in-flight calculation. Give that
  // real request a bounded latency window instead of racing the tiny grid.
  // The production handler, engine result, ledger and abort signal are unchanged.
  if(input.options.targetKm===7)await delay(5000,undefined,{signal});
  return response(input);
},close:async()=>{}},{usage,ingress:()=>{}});
compute.listen(54432,'127.0.0.1');
const server = createServer({ key: readFileSync('.cache/qa-membership/tls/server.key'), cert: readFileSync('.cache/qa-membership/tls/server.crt') }, async (req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); res.end('ready'); return; }
  if (req.url === '/functions/v1/usage') {
    const chunks=[]; for await (const chunk of req) chunks.push(chunk);
    const result=await handler(new Request('http://localhost/functions/v1/usage',{method:req.method,headers:req.headers,body:Buffer.concat(chunks)}));
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
  }
  if (req.url === '/api/v1/routes') {
    const upstream=request({hostname:'127.0.0.1',port:54432,path:'/v1/routes',method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.on('aborted',()=>upstream.destroy());res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});req.pipe(upstream);return;
  }
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
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {compute.close();server.close(()=>process.exit(0));});
