import type { SqlExecutor, StorageDatabase } from '../storage/types.ts';
import { StorageError } from '../storage/types.ts';
import { serialDatabase } from '../storage/serial-database.ts';
import { ownerId, type OwnerScope } from '../sync/ownership.ts';
import { defaultAccountPreferences, validatePreferences, type AccountPreferences, type AccountStatistics } from './model.ts';

export function createAccountRepository(db: StorageDatabase, scope: OwnerScope, now = Date.now) {
  db = serialDatabase(db);
  function check(expected: string) {
    if (ownerId(scope()) !== expected) throw new StorageError('validation', '계정이 변경되었어요. 현재 계정에서 다시 시도해 주세요.');
  }
  async function transaction<T>(work: (tx: SqlExecutor, owner: string) => Promise<T>): Promise<T> {
    const owner = ownerId(scope()); let result!: T;
    await db.withExclusiveTransactionAsync(async tx => { check(owner); result = await work(tx, owner); check(owner); });
    return result;
  }
  return {
    preferences: () => transaction(async (tx, owner) => {
      const row = await tx.getFirstAsync<{ preferences_json: string }>('SELECT preferences_json FROM account_preferences WHERE owner_id=?', owner);
      return validatePreferences(row ? JSON.parse(row.preferences_json) : defaultAccountPreferences);
    }),
    savePreferences: (input: AccountPreferences) => {
      const preferences = validatePreferences(input);
      return transaction(async (tx, owner) => {
        await tx.runAsync('INSERT INTO account_preferences(owner_id,preferences_json,updated_at) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET preferences_json=excluded.preferences_json,updated_at=excluded.updated_at', owner, JSON.stringify(preferences), now());
        return preferences;
      });
    },
    statistics: () => transaction(async (tx, owner): Promise<AccountStatistics> => {
      const courses = await tx.getFirstAsync<{ count: number }>('SELECT count(*) count FROM saved_courses WHERE owner_id=?', owner);
      const runs = await tx.getFirstAsync<{ count: number; finished: number; distance: number; duration: number }>(
        "SELECT count(*) count,coalesce(sum(CASE WHEN course_outcome='finished' THEN 1 ELSE 0 END),0) finished,coalesce(sum(distance_m),0) distance,coalesce(sum(active_ms),0) duration FROM running_sessions WHERE owner_id=? AND status='completed'", owner);
      return { courses: courses?.count ?? 0, runs: runs?.count ?? 0, finishedCourses: runs?.finished ?? 0, distanceM: runs?.distance ?? 0, activeMs: runs?.duration ?? 0 };
    }),
  };
}
export type AccountRepository = ReturnType<typeof createAccountRepository>;
