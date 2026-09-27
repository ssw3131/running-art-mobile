import { StorageError, type StorageDatabase } from './types.ts';

export const DATABASE_NAME = 'running-art.db';

// Append new migrations; never rewrite an already released migration.
// This is a test-only entity, not the future route/run data model.
export const migrations: readonly string[] = [
  `CREATE TABLE storage_test_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 200),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
];

export const SCHEMA_VERSION = migrations.length;

export async function migrateDatabase(db: StorageDatabase, steps: readonly string[] = migrations): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if (!row || !Number.isSafeInteger(row.user_version) || row.user_version < 0) {
      throw new Error('Invalid SQLite schema version');
    }
    if (row.user_version > steps.length) {
      throw new StorageError('newer-schema', '더 최신 앱에서 만든 데이터예요. 앱을 업데이트해 주세요. 기존 데이터는 유지돼요.');
    }
    for (let index = row.user_version; index < steps.length; index++) {
      await transaction.execAsync(steps[index]);
      // Version comes only from the migration array, never from user input.
      await transaction.execAsync(`PRAGMA user_version = ${index + 1}`);
    }
  });
}
