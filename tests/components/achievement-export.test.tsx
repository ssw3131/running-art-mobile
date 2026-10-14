import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { saveCardFile, shareCardFile } from '../../src/modules/achievements/image-file';

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(), writeAsStringAsync: jest.fn(), deleteAsync: jest.fn(),
  StorageAccessFramework: { requestDirectoryPermissionsAsync: jest.fn(), createFileAsync: jest.fn() },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const source = 'file:///cache/card.png', target = 'content://documents/RunPen.png';
const fs = jest.mocked(FileSystem), sharing = jest.mocked(Sharing);
beforeEach(() => {
  jest.resetAllMocks();
  fs.StorageAccessFramework.requestDirectoryPermissionsAsync.mockResolvedValue({ granted: true, directoryUri: 'content://documents/tree' });
  fs.StorageAccessFramework.createFileAsync.mockResolvedValue(target);
  fs.readAsStringAsync.mockResolvedValue('PNG bytes');
  fs.writeAsStringAsync.mockResolvedValue(); fs.deleteAsync.mockResolvedValue();
  sharing.isAvailableAsync.mockResolvedValue(true); sharing.shareAsync.mockResolvedValue();
});

test('S5 export cancellation creates no file and preserves the preview', async () => {
  fs.StorageAccessFramework.requestDirectoryPermissionsAsync.mockResolvedValue({ granted: false });
  await expect(saveCardFile(source, () => {})).resolves.toBe('cancelled');
  expect(fs.readAsStringAsync).not.toHaveBeenCalled();
  expect(fs.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();
  expect(fs.deleteAsync).not.toHaveBeenCalled();
});

test('S5 failed write removes only the partial destination and can be retried', async () => {
  fs.writeAsStringAsync.mockRejectedValueOnce(new Error('storage full'));
  await expect(saveCardFile(source, () => {})).rejects.toThrow('storage full');
  expect(fs.deleteAsync).toHaveBeenCalledTimes(1);
  expect(fs.deleteAsync).toHaveBeenCalledWith(target, { idempotent: true });
  await expect(saveCardFile(source, () => {})).resolves.toBe('saved');
  expect(fs.writeAsStringAsync).toHaveBeenLastCalledWith(target, 'PNG bytes', { encoding: 'base64' });
});

test('S5 account change while folder permission is open stops before reading or writing', async () => {
  let current = true;
  fs.StorageAccessFramework.requestDirectoryPermissionsAsync.mockImplementation(async () => {
    current = false; return { granted: true, directoryUri: 'content://documents/tree' };
  });
  await expect(saveCardFile(source, () => { if (!current) throw new Error('account changed'); })).rejects.toThrow('account changed');
  expect(fs.readAsStringAsync).not.toHaveBeenCalled();
  expect(fs.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();
});

test('S5 account change during file creation removes the empty target without writing', async () => {
  let current = true;
  fs.StorageAccessFramework.createFileAsync.mockImplementation(async () => { current = false; return target; });
  await expect(saveCardFile(source, () => { if (!current) throw new Error('account changed'); })).rejects.toThrow('account changed');
  expect(fs.writeAsStringAsync).not.toHaveBeenCalled();
  expect(fs.deleteAsync).toHaveBeenCalledWith(target, { idempotent: true });
});

test('S5 unavailable or failed sharing never deletes a preview or reports delivery', async () => {
  sharing.isAvailableAsync.mockResolvedValueOnce(false);
  await expect(shareCardFile(source, () => {})).rejects.toThrow('Sharing unavailable');
  expect(sharing.shareAsync).not.toHaveBeenCalled();
  sharing.shareAsync.mockRejectedValueOnce(new Error('native failure'));
  await expect(shareCardFile(source, () => {})).rejects.toThrow('native failure');
  await expect(shareCardFile(source, () => {})).resolves.toBeUndefined();
  expect(sharing.shareAsync).toHaveBeenLastCalledWith(source, expect.objectContaining({ mimeType: 'image/png' }));
  expect(fs.deleteAsync).not.toHaveBeenCalled();
});
