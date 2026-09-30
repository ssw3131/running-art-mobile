import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const codecs = { sha256, gunzip: (bytes, maxOutputLength) => gunzipSync(bytes, { maxOutputLength }),
  utf8: bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
export const options = { version: '0.2', shape: 'heart', targetKm: 3, radiusKm: 2 };
export const root = 'build/road-data';
