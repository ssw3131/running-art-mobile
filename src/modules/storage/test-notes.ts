import { StorageError, type SqlExecutor } from './types.ts';

export const NOTE_MAX_LENGTH = 200;

export type StorageTestNote = {
  id: number;
  content: string;
  createdAt: number;
  updatedAt: number;
};

function validContent(value: string): string {
  const content = value.trim();
  if (!content || content.length > NOTE_MAX_LENGTH || content.includes('\0')) {
    throw new StorageError('validation', `메모를 1~${NOTE_MAX_LENGTH}자로 입력해 주세요.`);
  }
  return content;
}

function validId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) throw new StorageError('validation', '올바른 메모를 선택해 주세요.');
}

export function createTestNoteRepository(db: SqlExecutor, now: () => number = Date.now) {
  return {
    list(): Promise<StorageTestNote[]> {
      return db.getAllAsync<StorageTestNote>(
        'SELECT id, content, created_at AS createdAt, updated_at AS updatedAt FROM storage_test_notes ORDER BY id DESC',
      );
    },
    async create(value: string): Promise<number> {
      const content = validContent(value);
      const timestamp = now();
      const result = await db.runAsync(
        'INSERT INTO storage_test_notes (content, created_at, updated_at) VALUES (?, ?, ?)',
        content, timestamp, timestamp,
      );
      return result.lastInsertRowId;
    },
    async update(id: number, value: string): Promise<void> {
      validId(id);
      const content = validContent(value);
      const result = await db.runAsync(
        'UPDATE storage_test_notes SET content = ?, updated_at = ? WHERE id = ?', content, now(), id,
      );
      if (result.changes !== 1) throw new StorageError('not-found', '메모를 찾지 못했어요. 목록을 새로고침해 주세요.');
    },
    async remove(id: number): Promise<void> {
      validId(id);
      const result = await db.runAsync('DELETE FROM storage_test_notes WHERE id = ?', id);
      if (result.changes !== 1) throw new StorageError('not-found', '메모를 찾지 못했어요. 목록을 새로고침해 주세요.');
    },
  };
}

export type TestNoteRepository = ReturnType<typeof createTestNoteRepository>;
