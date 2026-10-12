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
