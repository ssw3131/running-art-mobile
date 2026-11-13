import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

// Interior of the full mobile-signal triangle in pixel_5-overlays-v1,
// 1080x2340 at420dpi. This checks a controlled OS state, never app pixels.
export function fullSignalReady(bytes) {
  const png = PNG.sync.read(bytes);
  if (png.width !== 1080 || png.height !== 2340) throw Error('Unexpected SystemUI display profile');
  for (let y = 74; y < 78; y++) for (let x = 958; x < 960; x++) {
    const index = (png.width * y + x) * 4;
    if (![0, 1, 2].every(channel => png.data[index + channel] === 102) || png.data[index + 3] !== 255) return false;
  }
  return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify({ ready: fullSignalReady(readFileSync(0)) }));
}
