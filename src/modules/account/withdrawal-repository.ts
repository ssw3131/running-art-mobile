import type { StorageDatabase } from '../storage/types.ts';
import { StorageError } from '../storage/types.ts';
import { serialDatabase } from '../storage/serial-database.ts';
import { ownerId, requireOwner, type OwnerScope } from '../sync/ownership.ts';

// Only lifecycle metadata is stored here. The signed receipt stays in SecureStore.
export const withdrawalMigration = `
CREATE TABLE account_withdrawals(owner_id TEXT PRIMARY KEY NOT NULL,started_at INTEGER NOT NULL,retained_at INTEGER);
CREATE TRIGGER withdrawal_course_insert BEFORE INSERT ON saved_courses
WHEN EXISTS(SELECT 1 FROM account_withdrawals WHERE owner_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'Account withdrawal in progress'); END;
CREATE TRIGGER withdrawal_course_owner BEFORE UPDATE OF owner_id ON saved_courses
WHEN EXISTS(SELECT 1 FROM account_withdrawals WHERE owner_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'Account withdrawal in progress'); END;
CREATE TRIGGER withdrawal_run_insert BEFORE INSERT ON running_sessions
WHEN EXISTS(SELECT 1 FROM account_withdrawals WHERE owner_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'Account withdrawal in progress'); END;
CREATE TRIGGER withdrawal_run_owner BEFORE UPDATE OF owner_id ON running_sessions
WHEN EXISTS(SELECT 1 FROM account_withdrawals WHERE owner_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'Account withdrawal in progress'); END;
`;
type WithdrawalRow = { owner_id: string; started_at: number; retained_at: number | null };
function accountId(value: string) {
  if (!ownerId(value)) throw new StorageError('validation', '로그인한 계정에서 탈퇴를 요청해 주세요.');
  return value;
}
export function createWithdrawalRepository(database: StorageDatabase, scope: OwnerScope, now = Date.now) {
  const db = serialDatabase(database);
  return {
    state: (owner: string) => db.getFirstAsync<WithdrawalRow>('SELECT * FROM account_withdrawals WHERE owner_id=?', accountId(owner)),
    begin: (owner: string) => db.withExclusiveTransactionAsync(async tx => {
      requireOwner(scope, accountId(owner));
      if (await tx.getFirstAsync("SELECT id FROM running_sessions WHERE status!='completed'")) {
        throw new StorageError('validation', '진행 중인 러닝을 종료한 뒤 탈퇴해 주세요.');
      }
      await tx.runAsync('INSERT INTO account_withdrawals(owner_id,started_at) VALUES(?,?) ON CONFLICT(owner_id) DO NOTHING', owner, now());
      await tx.runAsync('UPDATE sync_accounts SET enabled=0 WHERE owner_id=?', owner);
      requireOwner(scope, owner);
    }),
    // Call only after the server has confirmed deletion for the persisted receipt.
    // The explicit owner is intentional: recovery also works after session expiry.
    retainAsGuest: (owner: string) => db.withExclusiveTransactionAsync(async tx => {
      const row = await tx.getFirstAsync<WithdrawalRow>('SELECT * FROM account_withdrawals WHERE owner_id=?', accountId(owner));
      if (!row) throw new StorageError('validation', '이 기기의 탈퇴 요청을 확인하지 못했어요. 기기 자료는 유지됩니다.');
      if (row.retained_at !== null) return;
      if (await tx.getFirstAsync("SELECT id FROM running_sessions WHERE owner_id=? AND status!='completed'", owner)) {
        throw new StorageError('validation', '진행 중인 러닝 기록을 확인해 주세요. 기기 자료는 유지됩니다.');
      }
      for (const table of ['saved_courses', 'running_sessions']) {
        await tx.runAsync(`UPDATE ${table} SET owner_id='',remote_version=0,dirty=1,mutation_id=lower(hex(randomblob(16))) WHERE owner_id=?`, owner);
      }
      // Keep the former account's settings and any existing guest settings too.
      await tx.runAsync("INSERT OR IGNORE INTO account_preferences(owner_id,preferences_json,updated_at) SELECT '',preferences_json,updated_at FROM account_preferences WHERE owner_id=?", owner);
      for (const table of ['sync_accounts', 'sync_deletions', 'sync_conflicts']) await tx.runAsync(`DELETE FROM ${table} WHERE owner_id=?`, owner);
      await tx.runAsync('UPDATE account_withdrawals SET retained_at=? WHERE owner_id=?', now(), owner);
    }),
  };
}
export type WithdrawalRepository = ReturnType<typeof createWithdrawalRepository>;
