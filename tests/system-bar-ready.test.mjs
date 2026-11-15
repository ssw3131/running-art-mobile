import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { fullSignalReady } from '../scripts/qa/system-bar-ready.mjs';
const original = readFileSync(new URL('./visual/android-linux-api36/run.png', import.meta.url));
test('full signal in the declared OS profile is ready without changing device bytes', () => {
  const before = Buffer.from(original);
  assert.equal(fullSignalReady(original), true);
  assert.deepEqual(original, before);
});
test('empty and partial signal cannot be accepted as full', () => {
  for (const count of [8, 1]) {
    const png = PNG.sync.read(original);
    for (let i = 0; i < count; i++) {
      const index = ((74 + Math.floor(i / 2)) * png.width + 958 + i % 2) * 4;
      png.data.fill(255, index, index + 3);
    }
    assert.equal(fullSignalReady(PNG.sync.write(png)), false);
  }
});
test('unknown geometry and malformed PNG fail', () => {
  assert.throws(() => fullSignalReady(PNG.sync.write(new PNG({ width: 1, height: 1 }))), /display profile/);
  assert.throws(() => fullSignalReady(Buffer.from('invalid')));
});
test('PR62 original unready SystemUI frames cannot pass the full-signal gate', () => {
  for (const attempt of [1, 2]) {
    const bytes = readFileSync(new URL(`../docs/quality/evidence/pr62-run43672071317/attempt${attempt}-systembar.png`, import.meta.url));
    const before = Buffer.from(bytes);
    assert.equal(fullSignalReady(bytes), false);
    assert.deepEqual(bytes, before);
  }
});
