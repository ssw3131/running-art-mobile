import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const output = process.argv[2];
if (!output || fs.existsSync(output)) throw new Error('Provide a new output directory');
// Explicit allowlist: no environment files, credentials, personal data or APKs.
const files = [
  ...['server','pool','worker','roads'].map(n => `server/route-compute/${n}.mjs`),
  ...['engine','types','runner'].map(n => `src/modules/route-engine/${n}.ts`),
  ...['bounds','channel','national-channel','national-format','file-format','persistent-cache'].map(n => `src/modules/road-data/${n}.ts`),
  'src/modules/route-compute/contract.ts',
];
const entries = files.map(file => {
  const bytes = fs.readFileSync(file), destination = path.join(output,file);
  fs.mkdirSync(path.dirname(destination),{recursive:true}); fs.writeFileSync(destination,bytes);
  return {path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
});
fs.writeFileSync(path.join(output,'package.json'),JSON.stringify({private:true,type:'module',engines:{node:'>=24.21.0 <25'}})+'\n');
fs.writeFileSync(path.join(output,'Dockerfile'),'FROM node:24-bookworm-slim\nWORKDIR /app\nCOPY --chown=node:node . .\nUSER node\nENV NODE_ENV=production\nCMD ["node", "server/route-compute/server.mjs"]\n');
fs.writeFileSync(path.join(output,'.dockerignore'),'.git\n*.log\n');
fs.writeFileSync(path.join(output,'bundle.json'),JSON.stringify({createdAt:new Date().toISOString(),files:entries},null,2)+'\n');
console.log(JSON.stringify({output,files:entries.length}));
