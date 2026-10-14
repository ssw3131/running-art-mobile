import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Directory, File } from 'expo-file-system';
import { saveCardFile, shareCardFile } from '../../src/modules/achievements/image-file';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: { requestDirectoryPermissionsAsync: jest.fn() },
}));
const mockRead = jest.fn(), mockWrite = jest.fn(), mockDelete = jest.fn(), mockCreate = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ bytes: mockRead })),
  Directory: jest.fn().mockImplementation(() => ({ createFile: mockCreate })),
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const source = 'file:///cache/card.png';
const directoryUri = 'content://com.android.providers.downloads.documents/tree/downloads';
const bytes = new Uint8Array([137, 80, 78, 71]);
const fs = jest.mocked(FileSystem), sharing = jest.mocked(Sharing);
beforeEach(() => {
  jest.clearAllMocks();
  for (const mock of [mockRead, mockWrite, mockDelete, mockCreate, fs.StorageAccessFramework.requestDirectoryPermissionsAsync, sharing.isAvailableAsync, sharing.shareAsync]) mock.mockReset();
  fs.StorageAccessFramework.requestDirectoryPermissionsAsync.mockResolvedValue({ granted: true, directoryUri });
  mockCreate.mockReturnValue({ write: mockWrite, delete: mockDelete });
  mockRead.mockResolvedValue(bytes);
  sharing.isAvailableAsync.mockResolvedValue(true); sharing.shareAsync.mockResolvedValue();
});

test('S5 export cancellation creates no file and preserves the preview', async () => {
  fs.StorageAccessFramework.requestDirectoryPermissionsAsync.mockResolvedValue({ granted: false });
  await expect(saveCardFile(source, () => {})).resolves.toBe('cancelled');
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockDelete).not.toHaveBeenCalled();
});

test('S5 failed write removes only the partial destination and can be retried', async () => {
  mockWrite.mockImplementationOnce(() => { throw new Error('storage full'); });
  await expect(saveCardFile(source, () => {})).rejects.toThrow('storage full');
  expect(mockDelete).toHaveBeenCalledTimes(1);
  await expect(saveCardFile(source, () => {})).resolves.toBe('saved');
  expect(mockWrite).toHaveBeenLastCalledWith(bytes);
  expect(File).toHaveBeenLastCalledWith(source);
  expect(Directory).toHaveBeenLastCalledWith(directoryUri);
  expect(mockCreate).toHaveBeenLastCalledWith(expect.stringMatching(/^RunPen-\d+\.png$/), 'image/png');
});

test('S5 account change while folder permission is open stops before reading or writing', async () => {
  let current = true;
  fs.StorageAccessFramework.requestDirectoryPermissionsAsync.mockImplementation(async () => {
    current = false; return { granted: true, directoryUri };
  });
  await expect(saveCardFile(source, () => { if (!current) throw new Error('account changed'); })).rejects.toThrow('account changed');
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});

test('S5 account change during file creation removes the empty target without writing', async () => {
  let current = true;
  mockCreate.mockImplementation(() => { current = false; return { write: mockWrite, delete: mockDelete }; });
  await expect(saveCardFile(source, () => { if (!current) throw new Error('account changed'); })).rejects.toThrow('account changed');
  expect(mockWrite).not.toHaveBeenCalled();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test('S5 unavailable or failed sharing never deletes a preview or reports delivery', async () => {
  sharing.isAvailableAsync.mockResolvedValueOnce(false);
  await expect(shareCardFile(source, () => {})).rejects.toThrow('Sharing unavailable');
  expect(sharing.shareAsync).not.toHaveBeenCalled();
  sharing.shareAsync.mockRejectedValueOnce(new Error('native failure'));
  await expect(shareCardFile(source, () => {})).rejects.toThrow('native failure');
  await expect(shareCardFile(source, () => {})).resolves.toBeUndefined();
  expect(sharing.shareAsync).toHaveBeenLastCalledWith(source, expect.objectContaining({ mimeType: 'image/png' }));
  expect(mockDelete).not.toHaveBeenCalled();
});
