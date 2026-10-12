import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
const base = process.argv[2];
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw Error('Pass the event base SHA, not user-controlled shell text');
const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
// Unknown changes are full. docs-only is the sole inexpensive exemption.
const docsOnly = changed.length > 0 && changed.every(file => /^(docs\/.*\.(md|html|json|png)|.*\.md)$/.test(file));
const compatibility = changed.some(file => /^(scripts\/qa\/|\.github\/workflows\/|plugins\/|app\.config\.|package(?:-lock)?\.json$)/.test(file));
const result = { docsOnly, changed, android: !docsOnly, api: !docsOnly, compatibility };
console.log(JSON.stringify(result, null, 2));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `full=${!docsOnly}\ncompatibility=${compatibility}\n`);
