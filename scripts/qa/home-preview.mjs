import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

// Check the native PNG, not only the image URL or accessibility hierarchy.
const [file, ...bounds] = process.argv.slice(2);
const [left, top, right, bottom] = bounds.map(Number);
const png = PNG.sync.read(readFileSync(file));
assert.ok([left, top, right, bottom].every(Number.isFinite) && right > left && bottom > top);
let pathPixels = 0;
for (let y = Math.max(0, top); y < Math.min(png.height, bottom); y++) {
  for (let x = Math.max(0, left); x < Math.min(png.width, right); x++) {
    const p = (y * png.width + x) * 4;
    if (png.data[p] > 235 && png.data[p + 1] > 65 && png.data[p + 1] < 110 && png.data[p + 2] < 25) pathPixels++;
  }
}
assert.ok(pathPixels > 40, `Saved GPS path must render inside its preview; got ${pathPixels} orange pixels`);
console.log(JSON.stringify({ file, pathPixels }));
