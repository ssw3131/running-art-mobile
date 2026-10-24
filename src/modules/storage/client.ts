import { migrateDatabase } from './migrations.ts';
import { createTestNoteRepository, type TestNoteRepository } from './test-notes.ts';
import type { StorageDatabase } from './types.ts';
import { createCourseRepository, type CourseRepository } from '../courses/repository.ts';
import { createRunRepository, type RunRepository } from '../running/repository.ts';
import { serialDatabase } from './serial-database.ts';
import { guestScope, type OwnerScope } from '../sync/ownership.ts';
import { createSyncRepository, type SyncRepository } from '../sync/repository.ts';
import { createAccountRepository, type AccountRepository } from '../account/repository.ts';
import { createWithdrawalRepository, type WithdrawalRepository } from '../account/withdrawal-repository.ts';
import { createHomeRepository, type HomeRepository } from '../home/repository.ts';
import { createAchievementsRepository, type AchievementsRepository } from '../achievements/repository.ts';
import { meteredCourses } from '../usage/courses.ts';
import type { UsageAccess } from '../usage/model.ts';

export type StorageRepositories = TestNoteRepository & { courses: CourseRepository; runs: RunRepository; sync: SyncRepository; account: AccountRepository; withdrawal: WithdrawalRepository; home: HomeRepository; achievements: AchievementsRepository;
  usageJobs: { read(): Promise<{id:string;request_json:string;result_json:string|null}|null>; write(id:string,request:string,result:string|null):Promise<void>; clear(id:string):Promise<void> } };

export function createStorageClient(open: () => Promise<StorageDatabase>, scope: OwnerScope = guestScope, usage?: UsageAccess) {
  let pending: Promise<StorageRepositories> | undefined;

  async function initialize(): Promise<StorageRepositories> {
    const db = serialDatabase(await open());
    try {
      await migrateDatabase(db);
      const rawCourses = createCourseRepository(db,Date.now,scope);
      const courses = usage ? meteredCourses(db, rawCourses, scope, usage) : rawCourses;
      return { ...createTestNoteRepository(db), courses, runs: createRunRepository(db,Date.now,scope), sync: createSyncRepository(db,scope), account: createAccountRepository(db,scope), withdrawal: createWithdrawalRepository(db,scope), home: createHomeRepository(db,scope), achievements: createAchievementsRepository(db,scope), usageJobs: {
        read: () => db.getFirstAsync('SELECT id,request_json,result_json FROM usage_generation_pending WHERE owner_id=?',scope()),
        async write(id,request,result) { await db.runAsync('INSERT INTO usage_generation_pending(owner_id,id,request_json,result_json) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET id=excluded.id,request_json=excluded.request_json,result_json=excluded.result_json',scope(),id,request,result); },
        async clear(id) { await db.runAsync('DELETE FROM usage_generation_pending WHERE owner_id=? AND id=?',scope(),id); },
      } };
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
