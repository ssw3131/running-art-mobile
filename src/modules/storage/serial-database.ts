import type { StorageDatabase } from './types.ts';

// Repositories share one queue; a sync restore must not overlap a GPS transaction.
const wrappers = new WeakMap<StorageDatabase, StorageDatabase>();
export function serialDatabase(database: StorageDatabase): StorageDatabase {
  const existing = wrappers.get(database);
  if (existing) return existing;
  let tail: Promise<unknown> = Promise.resolve();
  function queue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  }
  const wrapped: StorageDatabase = {
    execAsync: sql => queue(() => database.execAsync(sql)),
    runAsync: (sql, ...args) => queue(() => database.runAsync(sql, ...args)),
    getFirstAsync: (sql, ...args) => queue(() => database.getFirstAsync(sql, ...args)),
    getAllAsync: (sql, ...args) => queue(() => database.getAllAsync(sql, ...args)),
    withExclusiveTransactionAsync: task => queue(() => database.withExclusiveTransactionAsync(task)),
    closeAsync: () => queue(() => database.closeAsync()),
  };
  wrappers.set(database, wrapped);
  wrappers.set(wrapped, wrapped);
  return wrapped;
}
