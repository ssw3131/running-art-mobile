import { createStorageClient } from './client';
import { DATABASE_NAME } from './migrations';

export const getStorage = createStorageClient(async () => {
  // Lazy import also keeps a missing native module recoverable on this screen.
  const SQLite = await import('expo-sqlite');
  return SQLite.openDatabaseAsync(DATABASE_NAME);
});
