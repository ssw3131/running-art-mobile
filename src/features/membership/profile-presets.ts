import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { stripJpegMetadata, type PreparedProfilePhoto } from '@/modules/account/photo';

export const presetSource = require('../../../assets/signup/avatar-presets.png');
// Original Figma 237:2628..2651 mask coordinates in the 331.5 × 165.75 atlas.
export const presetSlots = [
  [7.5, 15.75], [72, 15.75], [135.5, 16], [201, 15.75],
  [265, 15.75], [7.5, 88], [72, 88], [137.5, 85],
] as const;
export async function prepareSignupPreset(index: number): Promise<PreparedProfilePhoto> {
  const slot = presetSlots[index];
  if (!slot) throw new Error('Invalid preset');
  const image = await Image.loadAsync(presetSource);
  const context = ImageManipulator.manipulate(image);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    const scale = image.width / 331.5;
    context.crop({ originX: Math.round(slot[0] * scale), originY: Math.round(slot[1] * scale), width: Math.round(60 * scale), height: Math.round(60 * scale) });
    rendered = await context.renderAsync();
    const output = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    const file = new File(output.uri);
    try {
      const bytes = stripJpegMetadata(await file.bytes()); file.write(bytes);
      return { bytes, hash: bytesToHex(sha256(bytes)), uri: file.uri };
    } catch (error) { if (file.exists) file.delete(); throw error; }
  } finally { rendered?.release(); context.release(); image.release(); }
}
