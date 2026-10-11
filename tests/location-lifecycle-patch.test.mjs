import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import patch from '../scripts/patch-expo-location.cjs';

// The build must never silently accept a dependency update that loses the fix.
const source = readFileSync(new URL('../node_modules/expo-location/' + patch.relative, import.meta.url), 'utf8');
test('pinned native lifecycle patch is idempotent, including Windows line endings', () => {
  const once = patch.patchSource(source);
  assert.equal(patch.patchSource(once), once);
  assert.equal(patch.patchSource(once.replace(/\n/g, '\r\n')), once);
});
test('unknown or partially applied native source fails before it can be built', () => {
  assert.throws(() => patch.patchSource(source + '\n// upstream change'), /source changed/);
  assert.throws(() => patch.patchSource(source.replace('Context.BIND_AUTO_CREATE', '0')), /source changed/);
});
test('prebuilt AAR configuration cannot silently omit the native fix', () => {
  const root = mkdtempSync(join(tmpdir(), 'runpen-location-'));
  try {
    writeFileSync(join(root, 'package.json'), '{}');
    assert.throws(() => patch.apply(root), /buildFromSource/);
    assert.equal(patch.apply(), patch.patchedHash);
  } finally {
    rmSync(join(root, 'package.json'), { force: true });
    rmdirSync(root);
  }
});
