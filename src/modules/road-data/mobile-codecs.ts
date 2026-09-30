import { gunzipSync, strFromU8 } from 'fflate';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { RoadCodecs } from './file-format.ts';

// Pure JS, usable in Hermes. Integrity is checked on both compressed and decoded bytes.
export const mobileRoadCodecs: RoadCodecs = {
  sha256: bytes => bytesToHex(sha256(bytes)),
  gunzip: (bytes, maxBytes) => {
    if (bytes.length < 18 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 32 * 1024 * 1024) {
      throw new Error('ROAD_FILE_GZIP_SIZE');
    }
    const declared = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 4, true);
    if (declared !== maxBytes) throw new Error('ROAD_FILE_GZIP_SIZE');
    // Fixed output bounds allocation even if a corrupt stream lies about its size.
    return gunzipSync(bytes, { out: new Uint8Array(maxBytes) });
  },
  utf8: bytes => strFromU8(bytes),
};
