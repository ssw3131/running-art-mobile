import * as FileSystem from 'expo-file-system/legacy';
import { Directory, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Retain handed-off PNGs for a day: a receiving app can still be reading them. */
export async function retainCard(uri: string) {
  if (!FileSystem.cacheDirectory) throw new Error('Image cache unavailable');
  const root = `${FileSystem.cacheDirectory}runpen-cards/`;
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  for (const name of await FileSystem.readDirectoryAsync(root)) {
    const match = /^(\d{13})-[a-z0-9]+\.png$/.exec(name);
    if (match && Date.now() - Number(match[1]) > 86400000) await FileSystem.deleteAsync(root + name, { idempotent: true }).catch(() => {});
  }
  const target = `${root}${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

export async function shareCardFile(uri: string, assertCurrent: () => void) {
  assertCurrent();
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing unavailable');
  assertCurrent();
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'RunPen 러닝 카드 공유' });
}

export async function saveCardFile(uri: string, assertCurrent: () => void): Promise<'saved' | 'cancelled'> {
  assertCurrent();
  const access = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  assertCurrent(); if (!access.granted) return 'cancelled';
  const bytes = await new File(uri).bytes();
  assertCurrent();
  // Legacy SAF writes accept only the externalstorage authority. Directory/File
  // also support the Downloads provider returned by Android 10's folder picker.
  const target = new Directory(access.directoryUri).createFile(`RunPen-${Date.now()}.png`, 'image/png');
  try { assertCurrent(); target.write(bytes); }
  catch (error) { try { target.delete(); } catch {} throw error; }
  return 'saved';
}
