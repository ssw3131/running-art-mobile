import { createStorageClient } from './client';
import { DATABASE_NAME } from './migrations';
import { authentication } from '../auth/runtime';
import { StorageError } from './types';

const initializeStorage = createStorageClient(async () => {
  // Lazy import also keeps a missing native module recoverable on this screen.
  const SQLite = await import('expo-sqlite');
  return SQLite.openDatabaseAsync(DATABASE_NAME);
}, () => {
  const auth = authentication.getSnapshot();
  if (!auth.ready) throw new StorageError('validation','로그인 상태를 확인 중이에요. 잠시 후 다시 시도해 주세요.');
  return auth.account?.id ?? '';
});

export async function getStorage() {
  await authentication.start();
  return initializeStorage();
}
