import * as FileSystem from 'expo-file-system/legacy';
import { loadNotices } from '../../src/modules/support/runtime';

const mockRpc = jest.fn();
jest.mock('../../src/modules/auth/runtime', () => ({
  authClient: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

const fs = jest.mocked(FileSystem), path = 'file:///cache/runpen-notices.json';
const cachedNotice = { id: 'saved', title: '저장한 공지', body: '이전 본문', category: '공지', publishedAt: '2026-10-01T00:00:00Z' };
type Reply = { data: unknown; error: Error | null };
let signal: AbortSignal, fetchedAt: number;
function remote(reply: Promise<Reply>) {
  mockRpc.mockReturnValue({
    abortSignal: (value: AbortSignal) => { signal = value; return reply; },
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRpc.mockReset();
  fetchedAt = Date.now() - 1000;
  fs.getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, uri: path, size: 200, modificationTime: 0 });
  fs.readAsStringAsync.mockResolvedValue(JSON.stringify({ notices: [cachedNotice], fetchedAt }));
  fs.writeAsStringAsync.mockResolvedValue(undefined);
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test.each([{ notices: [] }, { notices: [{ ...cachedNotice, id: 'fresh', body: '최신 본문' }] }])(
  'healthy notice responses replace the cache, including an empty publication list (%j)',
  async ({ notices }) => {
    remote(Promise.resolve({ data: notices, error: null }));
    await expect(loadNotices()).resolves.toEqual({ notices, fetchedAt: Date.now(), offline: false });
    expect(mockRpc).toHaveBeenCalledWith('get_service_notices');
    expect(fs.readAsStringAsync).not.toHaveBeenCalled();
    expect(fs.writeAsStringAsync).toHaveBeenCalledWith(path, JSON.stringify({ notices, fetchedAt: Date.now() }));
    expect(signal.aborted).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('a stalled request falls back at the deadline even when abort is ignored; a late reply cannot overwrite the cache', async () => {
  let finish!: (reply: Reply) => void;
  remote(new Promise(resolve => { finish = resolve; }));
  const request = loadNotices();
  let settled = false;
  void request.then(() => { settled = true; });
  await jest.advanceTimersByTimeAsync(9999);
  expect(settled).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  await expect(request).resolves.toEqual({ notices: [cachedNotice], fetchedAt, offline: true });
  expect(signal.aborted).toBe(true);
  expect(fs.writeAsStringAsync).not.toHaveBeenCalled();
  finish({ data: [], error: null });
  await Promise.resolve();
  await Promise.resolve();
  expect(fs.writeAsStringAsync).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('a stalled request without a saved publication reaches the existing error state instead of loading forever', async () => {
  fs.getInfoAsync.mockResolvedValue({ exists: false, isDirectory: false, uri: path });
  remote(new Promise(() => {}));
  const rejected = expect(loadNotices()).rejects.toThrow('공지를 불러오지 못했어요.');
  await jest.advanceTimersByTimeAsync(10_000);
  await rejected;
  expect(signal.aborted).toBe(true);
  expect(fs.readAsStringAsync).not.toHaveBeenCalled();
  expect(fs.writeAsStringAsync).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('an immediate request failure uses the saved publication without waiting for the deadline', async () => {
  remote(Promise.resolve({ data: null, error: new Error('offline') }));
  await expect(loadNotices()).resolves.toEqual({ notices: [cachedNotice], fetchedAt, offline: true });
  expect(signal.aborted).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});