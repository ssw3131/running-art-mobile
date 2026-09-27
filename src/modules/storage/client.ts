import { migrateDatabase } from './migrations.ts';
import { createTestNoteRepository, type TestNoteRepository } from './test-notes.ts';
import type { StorageDatabase } from './types.ts';

export function createStorageClient(open: () => Promise<StorageDatabase>) {
  let pending: Promise<TestNoteRepository> | undefined;

  async function initialize(): Promise<TestNoteRepository> {
    const db = await open();
    try {
      await migrateDatabase(db);
      return createTestNoteRepository(db);
    } catch (error) {
      // Never delete or recreate a failed database. Closing enables a clean retry.
      await db.closeAsync().catch(() => {});
      throw error;
    }
  }

  return function getStorage(): Promise<TestNoteRepository> {
    // One connection and one migration even when multiple screens request it.
    pending ??= initialize().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
