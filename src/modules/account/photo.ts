import { StorageError } from '../storage/types.ts';

export const PROFILE_PHOTO_BUCKET = 'profile-photos';
export const PROFILE_PHOTO_MAX_BYTES = 1024 * 1024;
export type PreparedProfilePhoto = { bytes: Uint8Array; hash: string; uri: string };
export function profilePhotoPath(owner: string, value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9-]{36}$/.test(owner) &&
    new RegExp(`^${owner}/[a-f0-9]{64}\\.jpg$`).test(value) ? value : null;
}

// The native decoder re-encodes the selected image first. Remove application and
// comment segments too, so EXIF/XMP/IPTC (including GPS) never leaves the device.
export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  const invalid = () => new StorageError('validation', '사진을 처리하지 못했어요. 다른 사진을 선택해 주세요.');
  if (input.length < 4 || input.length > PROFILE_PHOTO_MAX_BYTES || input[0] !== 255 || input[1] !== 216) throw invalid();
  const parts = [input.slice(0, 2)];
  let offset = 2, dimensions = false, scan = false;
  while (offset < input.length) {
    const start = offset;
    if (input[offset++] !== 255) throw invalid();
    while (input[offset] === 255) offset++;
    const marker = input[offset++];
    if (marker === 217) {
      if (!dimensions || !scan) throw invalid();
      parts.push(input.slice(start, offset));
      const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
      let index = 0; for (const part of parts) { output.set(part, index); index += part.length; }
      return output;
    }
    if (offset + 2 > input.length || marker === 0 || marker === 216 || marker >= 208 && marker <= 215) throw invalid();
    const length = input[offset] * 256 + input[offset + 1];
    const end = offset + length;
    if (length < 2 || end > input.length) throw invalid();
    if ([192, 193, 194].includes(marker)) {
      if (length < 8) throw invalid();
      const height = input[offset + 3] * 256 + input[offset + 4], width = input[offset + 5] * 256 + input[offset + 6];
      if (width < 1 || height < 1 || width > 512 || height > 512) throw invalid();
      dimensions = true;
    }
    if (!(marker >= 224 && marker <= 239) && marker !== 254) parts.push(input.slice(start, end));
    offset = end;
    if (marker === 218) {
      scan = true;
      const dataStart = offset;
      while (offset < input.length) {
        if (input[offset] !== 255) { offset++; continue; }
        const next = input[offset + 1];
        if (next === 0 || next >= 208 && next <= 215) { offset += 2; continue; }
        break;
      }
      parts.push(input.slice(dataStart, offset));
    }
  }
  throw invalid();
}
