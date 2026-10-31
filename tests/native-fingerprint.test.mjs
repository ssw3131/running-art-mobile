import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { nativeFingerprint } from '../scripts/native-fingerprint.mjs';
test('native fingerprint is newline-independent and ignores ordinary screen edits', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'runpen-fingerprint-'));
  const write = (name, content) => writeFileSync(path.join(root, name), content);
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    git(['init', '-q']);
    write('.gitattributes', '* text=auto eol=lf\n');
    write('package.json', '{\n"name":"fixture"\n}\n');
    write('screen.ts', 'export const title = "before";\n');
    git(['add', '.']);
    const before = nativeFingerprint(root).fingerprint;
    write('package.json', '{\r\n"name":"fixture"\r\n}\r\n');
    write('screen.ts', 'export const title = "after";\n');
    assert.equal(nativeFingerprint(root).fingerprint, before);
    write('package.json', '{"name":"fixture","dependencies":{"native-module":"1"}}\n');
    assert.notEqual(nativeFingerprint(root).fingerprint, before);
  } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('runpen-fingerprint-'));
    rmSync(root, { recursive: true, force: true });
  }
});
