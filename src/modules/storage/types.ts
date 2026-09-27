// Small async boundary shared by Expo SQLite and the real SQLite test adapter.
export type SqlValue = string | number | null;

export interface SqlExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
}

export interface StorageDatabase extends SqlExecutor {
  withExclusiveTransactionAsync(task: (transaction: SqlExecutor) => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

export class StorageError extends Error {
  readonly code: 'validation' | 'not-found' | 'newer-schema';

  constructor(
    code: StorageError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}

export function storageErrorMessage(error: unknown): string {
  return error instanceof StorageError
    ? error.message
    : '기기 저장소에 접근하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.';
}
