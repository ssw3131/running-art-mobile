import { StorageError, type StorageDatabase } from './types.ts';

export const DATABASE_NAME = 'running-art.db';

// Append new migrations; never rewrite an already released migration.
// Migration 1 is the original test-only entity; migration 2 adds local courses.
export const migrations: readonly string[] = [
  `CREATE TABLE storage_test_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 200),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE saved_courses (
    id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=32),
    name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
    source TEXT NOT NULL CHECK(source IN ('osm','synthetic')),
    shape TEXT NOT NULL,
    target_km REAL NOT NULL CHECK(target_km>0 AND target_km<=1000),
    length_km REAL NOT NULL CHECK(length_km>0 AND length_km<=1000),
    score REAL NOT NULL CHECK(score>=0 AND score<=100),
    snapshot_json TEXT NOT NULL CHECK(length(snapshot_json) BETWEEN 1 AND 2097152),
    snapshot_hash TEXT NOT NULL UNIQUE CHECK(length(snapshot_hash)=64),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX saved_courses_created ON saved_courses(created_at DESC,id DESC);`,
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
