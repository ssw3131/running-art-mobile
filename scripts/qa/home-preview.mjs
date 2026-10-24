import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

// Check the native PNG, not only the image URL or accessibility hierarchy.
const [file, ...args] = process.argv.slice(2);
const bounds = args.slice(0, 4), mode = args[4] ?? 'fallback';
assert.ok(['map', 'fallback'].includes(mode));
const [left, top, right, bottom] = bounds.map(Number);
const png = PNG.sync.read(readFileSync(file));
assert.ok([left, top, right, bottom].every(Number.isFinite) && right > left && bottom > top);
let pathPixels = 0;
for (let y = Math.max(0, top); y < Math.min(png.height, bottom); y++) {
  for (let x = Math.max(0, left); x < Math.min(png.width, right); x++) {
    const p = (y * png.width + x) * 4;
    const [r, g, b] = png.data.subarray(p, p + 3);
    if (r > 235 && g > 65 && g < 110 && (mode === 'map' ? b > 70 && b < 125 : b < 25)) pathPixels++;
  }
}
assert.ok(pathPixels > 40, `GPS path must render inside its ${mode} preview; got ${pathPixels} path pixels`);
console.log(JSON.stringify({ file, mode, pathPixels }));
