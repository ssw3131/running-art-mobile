import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { stripJpegMetadata, type PreparedProfilePhoto } from './photo';
import { StorageError } from '../storage/types';

export async function pickProfilePhoto(): Promise<PreparedProfilePhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1, exif: false, base64: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset || !asset.width || !asset.height || asset.width * asset.height > 64_000_000) throw new StorageError('validation', '사진 크기가 너무 큽니다. 작은 사진을 선택해 주세요.');
  const side = Math.min(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    context.crop({ originX: Math.floor((asset.width - side) / 2), originY: Math.floor((asset.height - side) / 2), width: side, height: side }).resize({ width: Math.min(side, 512), height: Math.min(side, 512) });
    rendered = await context.renderAsync();
    const output = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    const file = new File(output.uri);
    try {
      const bytes = stripJpegMetadata(await file.bytes());
      file.write(bytes);
      return { bytes, hash: bytesToHex(sha256(bytes)), uri: file.uri };
    } catch (error) { if (file.exists) file.delete(); throw error; }
  } finally { rendered?.release(); context.release(); }
}
export function discardProfilePhoto(photo: PreparedProfilePhoto | null) {
  if (!photo) return;
  try { const file = new File(photo.uri); if (file.exists) file.delete(); } catch { /* Cache is also managed by the OS. */ }
}
