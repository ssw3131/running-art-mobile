// Loopback-only laboratory server. No live OSM/API proxy, directory listing, or cloud deployment.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { readJson, root } from './common.mjs';
import { validateManifest } from '../../src/modules/road-data/file-format.ts';

export function createSampleServer() {
  const allowed = new Map();
  allowed.set('/benchmark-cases.json', path.join(root, 'benchmark-cases.json'));
  const config = readJson('scripts/road-data/samples.json');
  for (const step of config.gridStepsE7) {
    const prefix = `grid-${step}`, directory = path.join(root, prefix);
    const manifestPath = path.join(directory, 'manifest.json'), manifest = readJson(manifestPath);
    validateManifest(manifest);
    allowed.set(`/${prefix}/manifest.json`, manifestPath);
    for (const file of manifest.files) allowed.set(`/${prefix}/${file.path}`, path.join(directory, file.path));
  }
  return http.createServer((request, response) => {
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    const file = allowed.get(new URL(request.url, 'http://localhost').pathname);
    if (!file) { response.writeHead(404).end(); return; }
    const stream = fs.createReadStream(file);
    stream.on('error', () => { if (!response.headersSent) response.writeHead(500); response.end(); });
    response.writeHead(200, { 'Content-Type': file.endsWith('.gz') ? 'application/octet-stream' : 'application/json',
      'Content-Length': fs.statSync(file).size, 'Cache-Control': 'no-store',
      'X-Road-Lab': 'local-only-not-cdn', 'X-Content-Type-Options': 'nosniff' });
    // No Content-Encoding: client receives the exact .gz bytes for integrity checks.
    stream.pipe(response);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = createSampleServer();
  const port = Number(process.argv[2] ?? 8766);
  server.listen(port, '127.0.0.1', () => console.log(`Road sample server: http://127.0.0.1:${port}`));
}
