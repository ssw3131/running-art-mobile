import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { isDeepStrictEqual } from 'node:util';

export function comparePng(reference, actual, masks = []) {
  const a = PNG.sync.read(reference), b = PNG.sync.read(actual);
  if (a.width !== b.width || a.height !== b.height) throw Error('Image dimensions differ; environment or layout changed');
  for (const mask of masks) {
    if (mask.reason !== 'system-clock' || mask.x < 0 || mask.y < 0 || mask.width < 1 || mask.height < 1 || mask.x + mask.width > a.width || mask.y + mask.height > Math.min(100, a.height * 0.05)) throw Error('Only a documented system-clock mask inside the status bar is permitted');
    for (let y = mask.y; y < mask.y + mask.height; y++) for (let x = mask.x; x < mask.x + mask.width; x++) {
      const offset = (y * a.width + x) * 4;
      a.data.fill(0, offset, offset + 4); b.data.fill(0, offset, offset + 4);
    }
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1, includeAA: false });
  return { pixels, diff: PNG.sync.write(diff) };
}

if (process.argv[1]?.endsWith('visual.mjs')) {
  const [baselinePath, actualPath, outputPath] = process.argv.slice(2);
  if (!baselinePath || !actualPath || !outputPath) throw Error('Usage: visual.mjs baseline.json actual.json output-dir');
  mkdirSync(outputPath, { recursive: true });
  const actual = JSON.parse(readFileSync(actualPath)), results = [];
  let baseline;
  if (existsSync(baselinePath)) baseline = JSON.parse(readFileSync(baselinePath));
  if (!baseline?.reviewed || !isDeepStrictEqual(baseline.environment, actual.environment)) {
    writeFileSync(path.join(outputPath, 'report.json'), JSON.stringify({ status: 'not_run', reason: 'No reviewed baseline for this exact environment', candidate: actualPath }, null, 2));
    throw Error('Visual baseline requires review for this environment');
  }
  for (const entry of baseline.screens) {
    const current = actual.screens.find(screen => screen.id === entry.id);
    if (!current) throw Error(`Missing scenario ${entry.id}`);
    if (!/^[a-z0-9-]+$/.test(entry.id)) throw Error('Invalid scenario identifier');
    const a = readFileSync(path.resolve(path.dirname(baselinePath), entry.file));
    const b = readFileSync(path.resolve(path.dirname(actualPath), current.file));
    const result = comparePng(a, b, entry.masks ?? []);
    writeFileSync(path.join(outputPath, `${entry.id}-baseline.png`), a);
    writeFileSync(path.join(outputPath, `${entry.id}-current.png`), b);
    writeFileSync(path.join(outputPath, `${entry.id}-diff.png`), result.diff);
    results.push({ id: entry.id, status: result.pixels ? 'failed' : 'passed', pixels: result.pixels,
      baselineSha256: createHash('sha256').update(a).digest('hex'), currentSha256: createHash('sha256').update(b).digest('hex') });
  }
  if (actual.screens.length !== baseline.screens.length) throw Error('Unreviewed scenario set');
  writeFileSync(path.join(outputPath, 'report.json'), JSON.stringify({ status: results.every(result => result.status === 'passed') ? 'passed' : 'failed',
    environment: actual.environment, source: actual.source, apkSha256: actual.apkSha256, fixtureSha256: actual.fixtureSha256, results }, null, 2));
  process.exitCode = results.some(result => result.status !== 'passed') ? 1 : 0;
}
