import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import { readJson, writeJson, sha256 } from '../road-data/common.mjs';

const { values } = parseArgs({ options: {
  directory: { type: 'string', default: '.cache/server-compute/fixtures' },
  output: { type: 'string', default: 'build/server-compute/20261005' },
} });
assert.ok(!fs.existsSync(values.output), 'Use a new empty output path; existing bundles are preserved');
const index = readJson(path.join(values.directory, 'index.json'));
const files = [
  ...['runtime', 'worker', 'server', 'hosted'].map(name => `scripts/server-compute/${name}.mjs`),
  'scripts/road-data/common.mjs',
  ...['engine', 'runner', 'types'].map(name => `src/modules/route-engine/${name}.ts`),
  'src/modules/road-data/file-format.ts',
];
const copied = [];
function copy(source, destination) {
  const bytes = fs.readFileSync(source), target = path.join(values.output, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
  copied.push({ path: destination, bytes: bytes.length, sha256: sha256(bytes) });
}
for (const file of files) copy(file, file);
const data = new Set(['index.json']);
for (const entry of index.cases) {
  data.add(entry.synthetic ? 'grid.json' : `${entry.manifestHash}.json`);
  entry.files.forEach(file => data.add(`${file.sha256}.json.gz`));
}
for (const file of data) copy(path.join(values.directory, file), `fixtures/${file}`);
writeJson(path.join(values.output, 'package.json'), { private: true, type: 'module',
  engines: { node: '>=24.21.0 <25' }, scripts: { start: 'node scripts/server-compute/hosted.mjs' } });
fs.writeFileSync(path.join(values.output, 'Dockerfile'), 'FROM node:24-bookworm-slim\nWORKDIR /app\nCOPY --chown=node:node . .\nUSER node\nENV NODE_ENV=production\nCMD ["node", "scripts/server-compute/hosted.mjs"]\n');
fs.writeFileSync(path.join(values.output, '.dockerignore'), '.git\n*.log\n');
fs.writeFileSync(path.join(values.output, 'NOTICE.txt'), 'Road data: OpenStreetMap contributors, ODbL-1.0, https://www.openstreetmap.org/copyright\nPublic synthetic/test centers only. No account credentials or personal GPS records.\nFixed-case performance probe, not a production route API. Cloud Run IAM authentication is required.\n');
writeJson(path.join(values.output, 'bundle.json'), { createdAt: new Date().toISOString(), files: copied,
  totalCopiedBytes: copied.reduce((n, file) => n + file.bytes, 0),
  note: 'Node 24 image tag is floating; record resolved image digest and actual runtime at deployment. Docker/cloud not yet validated.' });
console.log(JSON.stringify({ output: values.output, copiedFiles: copied.length, copiedBytes: copied.reduce((n, f) => n + f.bytes, 0) }));
