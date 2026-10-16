import * as FileSystem from 'expo-file-system/legacy';
import { authClient } from '../auth/runtime';
import { parseNotices } from './content';
import { createSupportRemote } from './remote';
export const supportRemote = authClient ? createSupportRemote(authClient) : null;
const cache = () => FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}runpen-notices.json` : null;
export async function loadNotices() {
  try {
    if (!supportRemote) throw new Error('Unavailable');
    const notices = await supportRemote.notices(), fetchedAt = Date.now(), path = cache();
    if (path) await FileSystem.writeAsStringAsync(path, JSON.stringify({ notices, fetchedAt })).catch(() => undefined);
    return { notices, fetchedAt, offline: false };
  } catch {
    const path = cache();
    if (path) {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists && !info.isDirectory && info.size <= 13000000) {
        const data = JSON.parse(await FileSystem.readAsStringAsync(path));
        if (!Number.isFinite(data.fetchedAt) || data.fetchedAt > Date.now()) throw new Error('Invalid cache');
        return { notices: parseNotices(data.notices), fetchedAt: data.fetchedAt as number, offline: true };
      }
    }
    throw new Error('공지를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  }
}
