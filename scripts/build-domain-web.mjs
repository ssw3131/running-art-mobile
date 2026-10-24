import { mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import './build-share-web.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const site of ['company', 'runpen']) {
  const destination = path.join(root, 'build/domain-web', site);
  await mkdir(destination, { recursive: true });
  for (const file of ['index.html', '404.html', '_headers']) {
    await copyFile(path.join(root, 'web/domains', site, file), path.join(destination, file));
  }
}
await cp(path.join(root, 'build/run-share-web'), path.join(root, 'build/domain-web/runpen/share'), { recursive: true });
// Nested _headers files are not interpreted by Workers Static Assets.
const { rm } = await import('node:fs/promises');
await rm(path.join(root, 'build/domain-web/runpen/share/_headers'));
console.log('Built company and RunPen domain assets; no policy drafts or private records included.');
