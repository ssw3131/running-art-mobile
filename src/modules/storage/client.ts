import { migrateDatabase } from './migrations.ts';
import { createTestNoteRepository, type TestNoteRepository } from './test-notes.ts';
import type { StorageDatabase } from './types.ts';
import { createCourseRepository, type CourseRepository } from '../courses/repository.ts';
import { createRunRepository, type RunRepository } from '../running/repository.ts';
import { serialDatabase } from './serial-database.ts';
import { guestScope, type OwnerScope } from '../sync/ownership.ts';
import { createSyncRepository, type SyncRepository } from '../sync/repository.ts';

export type StorageRepositories = TestNoteRepository & { courses: CourseRepository; runs: RunRepository; sync: SyncRepository };

export function createStorageClient(open: () => Promise<StorageDatabase>, scope: OwnerScope = guestScope) {
  let pending: Promise<StorageRepositories> | undefined;

  async function initialize(): Promise<StorageRepositories> {
    const db = serialDatabase(await open());
    try {
      await migrateDatabase(db);
      return { ...createTestNoteRepository(db), courses: createCourseRepository(db,Date.now,scope), runs: createRunRepository(db,Date.now,scope), sync: createSyncRepository(db,scope) };
    } catch (error) {
      // Never delete or recreate a failed database. Closing enables a clean retry.
      await db.closeAsync().catch(() => {});
      throw error;
    }
  }

  return function getStorage(): Promise<StorageRepositories> {
    // One connection and one migration even when multiple screens request it.
    pending ??= initialize().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
