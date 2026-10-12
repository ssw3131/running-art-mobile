import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { comparePng } from '../scripts/qa/visual.mjs';
test('VISUAL-PROBE-01: an obscured button on the real Android home screenshot is detected', () => {
  const baseline = readFileSync('docs/quality/screenshots/service-s0-20261012/01-home.png');
  assert.equal(comparePng(baseline, baseline).pixels, 0);
  const altered = PNG.sync.read(baseline);
  // Cover part of the visible bottom navigation, without changing the baseline.
  for (let y = altered.height - 190; y < altered.height - 100; y++) for (let x = 80; x < 210; x++) {
    const i = (y * altered.width + x) * 4; altered.data.set([255, 0, 255, 255], i);
  }
  assert.ok(comparePng(baseline, PNG.sync.write(altered)).pixels > 1000);
  assert.throws(() => comparePng(baseline, baseline, [{ reason: 'hide-product-diff', x: 0, y: 0, width: 100, height: 100 }]));
});

test('VISUAL-PROBE-02: documented Wi-Fi mask cannot hide product changes or expand across the status bar', () => {
  const baseline = readFileSync('tests/visual/android-linux-api36/home.png');
  const mask = { reason: 'system-wifi-rasterization', x: 817, y: 53, width: 41, height: 33 };
  const altered = PNG.sync.read(baseline);
  const paint = (x, y) => altered.data.set([255, 0, 255, 255], (y * altered.width + x) * 4);
  for (let y = 60; y < 70; y++) for (let x = 825; x < 840; x++) paint(x, y);
  assert.ok(comparePng(baseline, PNG.sync.write(altered)).pixels > 0);
  assert.equal(comparePng(baseline, PNG.sync.write(altered), [mask]).pixels, 0);
  for (let y = 2200; y < 2220; y++) for (let x = 100; x < 120; x++) paint(x, y);
  assert.ok(comparePng(baseline, PNG.sync.write(altered), [mask]).pixels > 0);
  assert.throws(() => comparePng(baseline, baseline, [{ ...mask, width: 100 }]));
  assert.throws(() => comparePng(baseline, baseline, [{ ...mask, y: 300 }]));
  assert.throws(() => comparePng(baseline, baseline, [{ reason: 'system-clock', x: 0, y: 0, width: 1080, height: 90 }]));
});
