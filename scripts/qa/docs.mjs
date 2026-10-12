import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
const base = process.argv[2];
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw Error('Expected event base SHA');
const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD'], { encoding: 'utf8' }).trim().split('\n');
const failures = [];
for (const file of changed.filter(file => file.endsWith('.md'))) {
  const text = readFileSync(file, 'utf8');
  if (!text.trim()) failures.push(`${file}: empty document`);
  for (const match of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z]+:|#|\/)/i.test(href)) continue;
    const target = decodeURIComponent(href.split('#')[0]);
    if (target && !existsSync(path.resolve(path.dirname(file), target))) failures.push(`${file}: missing ${target}`);
  }
}
if (failures.length) throw Error(failures.join('\n'));
console.log('PASS: changed Markdown is nonempty and relative file links resolve');
