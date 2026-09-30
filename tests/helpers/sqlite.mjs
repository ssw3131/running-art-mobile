import { DatabaseSync } from 'node:sqlite';

export function openSqlite(filename = ':memory:', hooks = {}) {
  const sqlite = new DatabaseSync(filename);
  let closed = false;
  const executor = {
    async execAsync(sql) { sqlite.exec(sql); },
    async runAsync(sql, ...params) {
      const result = sqlite.prepare(sql).run(...params);
      await hooks.afterRun?.(sql, params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getFirstAsync(sql, ...params) { const row = sqlite.prepare(sql).get(...params); return row ? { ...row } : null; },
    async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params).map(row => ({ ...row })); },
  };
  return { ...executor,
    async withExclusiveTransactionAsync(task) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await task(executor); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    async closeAsync() { if (!closed) { closed = true; sqlite.close(); } },
  };
}
