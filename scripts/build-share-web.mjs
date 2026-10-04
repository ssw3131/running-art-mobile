import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { authConfig } from '../src/modules/auth/config.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'build/run-share-web');
const auth = authConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const mapKey = process.env.EXPO_PUBLIC_MAPTILER_API_KEY?.trim();
if (!auth || !mapKey) throw new Error('Provide the public Supabase URL/publishable key and a public MapTiler browser key via environment variables. No server secrets are accepted.');
await mkdir(destination, { recursive: true });
for (const name of ['index.html', 'style.css', 'app.js', 'map-provider.js', '_headers', 'robots.txt']) {
  await copyFile(path.join(root, 'web/run-share', name), path.join(destination, name));
}
const source = await readFile(path.join(root, 'src/modules/run-sharing/model.ts'), 'utf8');
const model = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true } }).outputText;
if (/^import /m.test(model)) throw new Error('Shared browser model must remain runtime-independent');
await writeFile(path.join(destination, 'model.js'), model);
await writeFile(path.join(destination, 'config.json'), JSON.stringify({ schemaVersion: 1, apiUrl: auth.url, publicKey: auth.key, mapKey }));
console.log('Built the shared-run viewer with public client configuration. No GPS records are bundled.');
