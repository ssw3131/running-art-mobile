import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createStorageClient } from '../src/modules/storage/client.ts';
import { migrateDatabase, migrations, SCHEMA_VERSION } from '../src/modules/storage/migrations.ts';
import { createTestNoteRepository, NOTE_MAX_LENGTH } from '../src/modules/storage/test-notes.ts';
import { storageErrorMessage } from '../src/modules/storage/types.ts';

// Run production SQL against real SQLite. Native bridge behavior is checked on Android separately.
function openDatabase(filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  let closed = false;
  const executor = {
    async execAsync(sql) { sqlite.exec(sql); },
    async runAsync(sql, ...params) {
      const result = sqlite.prepare(sql).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getFirstAsync(sql, ...params) {
      const row = sqlite.prepare(sql).get(...params);
      return row ? { ...row } : null;
    },
    async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params).map((row) => ({ ...row })); },
  };
  return {
    ...executor,
    async withExclusiveTransactionAsync(task) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        await task(executor);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async closeAsync() { if (!closed) { closed = true; sqlite.close(); } },
  };
}

function fixture(t) {
  const db = openDatabase();
  t.after(() => db.closeAsync());
  return db;
}

test('fresh database migrates and repeated initialization preserves existing notes', async (t) => {
  const db = fixture(t);
  await migrateDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, SCHEMA_VERSION);
  const notes = createTestNoteRepository(db, () => 1000);
  assert.deepEqual(await notes.list(), []);
  const id = await notes.create('첫 번째 메모');
  await migrateDatabase(db);
  assert.deepEqual(await notes.list(), [{ id, content: '첫 번째 메모', createdAt: 1000, updatedAt: 1000 }]);
});

test('pending migrations apply in order, preserve data and are not run twice', async (t) => {
  const db = fixture(t);
  await migrateDatabase(db);
  const repository = createTestNoteRepository(db);
  await repository.create('유지할 메모');
  const next = [...migrations,
    "ALTER TABLE storage_test_notes ADD COLUMN category TEXT NOT NULL DEFAULT 'test';",
    "UPDATE storage_test_notes SET category = 'upgraded';",
  ];
  await migrateDatabase(db, next);
  await migrateDatabase(db, next);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, next.length);
  assert.deepEqual(await db.getFirstAsync('SELECT content, category FROM storage_test_notes'),
    { content: '유지할 메모', category: 'upgraded' });
});

test('a failed migration rolls back schema, data and version; a corrected retry succeeds', async (t) => {
  const db = fixture(t);
  await migrateDatabase(db);
  const repository = createTestNoteRepository(db);
  await repository.create('보존');
  const before = await repository.list();
  await assert.rejects(migrateDatabase(db, [...migrations,
    "CREATE TABLE partial_change (id INTEGER); UPDATE storage_test_notes SET content = 'changed';",
    'INVALID SQL;',
  ]));
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, SCHEMA_VERSION);
  assert.equal(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'partial_change'"), null);
  assert.deepEqual(await repository.list(), before);
  await migrateDatabase(db, [...migrations, 'CREATE TABLE partial_change (id INTEGER);']);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, SCHEMA_VERSION + 1);
});

test('a newer schema is rejected without deleting or downgrading its data', async (t) => {
  const db = fixture(t);
  await migrateDatabase(db);
  const repository = createTestNoteRepository(db);
  await repository.create('미래 버전 자료');
  const before = await repository.list();
  await db.execAsync('PRAGMA user_version = 99');
  await assert.rejects(migrateDatabase(db), { code: 'newer-schema' });
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 99);
  assert.deepEqual(await repository.list(), before);
});

test('CRUD binds quoted SQL literally and changes only the selected note', async (t) => {
  const db = fixture(t);
  await migrateDatabase(db);
  let clock = 1000;
  const repository = createTestNoteRepository(db, () => clock);
  const content = "달리기 🏃 '); DROP TABLE storage_test_notes; --";
  const id = await repository.create(`  ${content}  `);
  const otherId = await repository.create('다른 메모');
  clock = 2000;
  await repository.update(id, `${content} 수정`);
  assert.deepEqual(await repository.list(), [
    { id: otherId, content: '다른 메모', createdAt: 1000, updatedAt: 1000 },
    { id, content: `${content} 수정`, createdAt: 1000, updatedAt: 2000 },
  ]);
  await repository.remove(id);
  assert.deepEqual((await repository.list()).map((row) => row.id), [otherId]);
  await repository.remove(otherId);
  assert.deepEqual(await repository.list(), []);
});

test('invalid input and stale IDs cannot create or modify data', async (t) => {
  const db = fixture(t);
  await migrateDatabase(db);
  const repository = createTestNoteRepository(db);
  for (const value of ['', ' \t\n ', 'x'.repeat(NOTE_MAX_LENGTH + 1), 'a\0b']) {
    await assert.rejects(repository.create(value), { code: 'validation' });
  }
  const id = await repository.create('x'.repeat(NOTE_MAX_LENGTH));
  await assert.rejects(repository.update(id, '  '), { code: 'validation' });
  for (const badId of [0, -1, NaN, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(repository.update(badId, 'bad'), { code: 'validation' });
    await assert.rejects(repository.remove(badId), { code: 'validation' });
  }
  await assert.rejects(repository.update(id + 100, 'missing'), { code: 'not-found' });
  await assert.rejects(repository.remove(id + 100), { code: 'not-found' });
  assert.equal((await repository.list())[0].content, 'x'.repeat(NOTE_MAX_LENGTH));
});

test('SQLite constraints protect the table even when the repository is bypassed', async (t) => {
  const db = fixture(t);
  await migrateDatabase(db);
  for (const value of [null, '', '   ', 'x'.repeat(NOTE_MAX_LENGTH + 1)]) {
    await assert.rejects(db.runAsync(
      'INSERT INTO storage_test_notes (content, created_at, updated_at) VALUES (?, ?, ?)', value, 1, 1,
    ));
  }
  assert.deepEqual(await createTestNoteRepository(db).list(), []);
});

test('file database survives close/reopen, including updates and deletions', async (t) => {
  const root = path.resolve('.cache/storage-tests');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(path.join(root, 'case-'));
  const filename = path.join(directory, 'persistence.db');
  let db = openDatabase(filename);
  t.after(async () => {
    await db.closeAsync();
    assert.ok(path.resolve(directory).startsWith(root + path.sep));
    rmSync(directory, { recursive: true });
  });
  await migrateDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA journal_mode')).journal_mode, 'wal');
  const repository = createTestNoteRepository(db, () => 1000);
  const retained = await repository.create('재시작 후 보존');
  const deleted = await repository.create('삭제 대상');
  await repository.update(retained, '수정된 메모');
  await repository.remove(deleted);
  const before = await repository.list();
  await db.closeAsync();
  db = openDatabase(filename);
  await migrateDatabase(db);
  assert.deepEqual(await createTestNoteRepository(db).list(), before);
});

test('concurrent initialization shares one database and one ready repository', async (t) => {
  const db = fixture(t);
  let opens = 0;
  const getStorage = createStorageClient(async () => { opens++; return db; });
  const [first, second] = await Promise.all([getStorage(), getStorage()]);
  assert.equal(opens, 1);
  assert.equal(first, second);
  await first.create('ready');
  assert.equal((await second.list()).length, 1);
});

test('open failure is surfaced and a later initialization can retry', async (t) => {
  const db = fixture(t);
  let opens = 0;
  const getStorage = createStorageClient(async () => {
    if (++opens === 1) throw new Error('disk unavailable');
    return db;
  });
  await assert.rejects(getStorage(), /disk unavailable/);
  assert.deepEqual(await (await getStorage()).list(), []);
  assert.equal(opens, 2);
});

test('migration failure closes the failed connection and allows a fresh attempt', async (t) => {
  const db = fixture(t);
  let opens = 0;
  let closes = 0;
  const getStorage = createStorageClient(async () => ++opens === 1 ? {
    ...db,
    async execAsync() { throw new Error('disk full'); },
    async closeAsync() { closes++; },
  } : db);
  await assert.rejects(getStorage(), /disk full/);
  assert.equal(closes, 1);
  assert.deepEqual(await (await getStorage()).list(), []);
});

test('write failures propagate without presenting an optimistic row', async (t) => {
  const db = fixture(t);
  await migrateDatabase(db);
  const repository = createTestNoteRepository({ ...db, async runAsync() { throw new Error('SQLITE_FULL'); } });
  await assert.rejects(repository.create('not saved'), /SQLITE_FULL/);
  assert.deepEqual(await repository.list(), []);
  assert.doesNotMatch(storageErrorMessage(new Error('private SQL details')), /private SQL/);
});
