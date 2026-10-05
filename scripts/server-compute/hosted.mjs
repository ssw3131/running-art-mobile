// Fixed public test cases only. Cloud Run must require IAM authentication.
import http from 'node:http';
import { startServer } from './server.mjs';

const workers = Number(process.env.BENCHMARK_WORKERS ?? '1');
const backend = await startServer({ directory: 'fixtures', workers, maxQueue: 8, timeoutMs: 110000 });
const proxy = http.createServer((request, response) => {
  if (request.url !== '/health' && !/^\/calculate\/(grid|gangnam|busan)$/.test(request.url)) {
    response.writeHead(404); response.end(); return;
  }
  const upstream = http.request(new URL(request.url, backend.url), { method: request.method }, reply => {
    response.writeHead(reply.statusCode, reply.headers); reply.pipe(response);
  });
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
  response.on('close', () => upstream.destroy());
  request.pipe(upstream);
});
// The local smoke test stays on loopback; only managed Cloud Run sets K_SERVICE.
proxy.listen(Number(process.env.PORT ?? '8080'), process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(JSON.stringify({ ready: true, port: proxy.address().port, node: process.version, workers }));
});
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  proxy.close(); proxy.closeAllConnections(); await backend.close();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
