import type { SqlExecutor, StorageDatabase } from '../storage/types.ts';
import { serialDatabase } from '../storage/serial-database.ts';
import { summaryColumns } from '../courses/repository.ts';
import { decodeSnapshot, type CourseSummary } from '../courses/model.ts';
import { columns as runColumns, pointColumns } from '../running/repository.ts';
import type { Run, RunPoint } from '../running/model.ts';
import { requireOwner, type OwnerScope } from './ownership.ts';
import { decodePayload, tableFor, SyncError, type PendingRecord, type RecordKind, type RemoteRecord } from './model.ts';

type Metadata = { id: string; remoteVersion: number; mutationId: string; dirty: number };
const meta = 'id,remote_version AS remoteVersion,mutation_id AS mutationId,dirty';
export type SyncConflict = { kind: RecordKind; id: string; remote: RemoteRecord };
export function createSyncRepository(database: StorageDatabase, scope: OwnerScope) {
  const db = serialDatabase(database);
  async function transaction<T>(owner: string, work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    let result!: T;
    await db.withExclusiveTransactionAsync(async tx => {
      requireOwner(scope, owner);
      result = await work(tx);
      requireOwner(scope, owner);
    });
    return result;
  }
  async function local(tx: SqlExecutor, owner: string, kind: RecordKind, id: string): Promise<Metadata | null> {
    return tx.getFirstAsync<Metadata>(`SELECT ${meta} FROM ${tableFor(kind)} WHERE owner_id=? AND id=?`, owner, id);
  }
  async function deletion(tx: SqlExecutor, owner: string, kind: RecordKind, id: string) {
    return tx.getFirstAsync<Omit<Metadata, 'dirty'>>('SELECT id,remote_version AS remoteVersion,mutation_id AS mutationId FROM sync_deletions WHERE owner_id=? AND kind=? AND id=?', owner, kind, id);
  }
  async function conflict(tx: SqlExecutor, remote: RemoteRecord) {
    await tx.runAsync('INSERT OR REPLACE INTO sync_conflicts(owner_id,kind,id,remote_json) VALUES(?,?,?,?)', remote.owner_id, remote.kind, remote.record_id, JSON.stringify(remote));
  }
  async function apply(tx: SqlExecutor, remote: RemoteRecord, payload: string | null) {
    const { owner_id: owner, kind, record_id: id } = remote;
    // A global local ID collision must never overwrite another account's record.
    const collision = await tx.getFirstAsync<{ owner_id: string }>(`SELECT owner_id FROM ${tableFor(kind)} WHERE id=?`, id);
    if (collision && collision.owner_id !== owner) throw new SyncError('다른 계정의 기기 기록과 식별자가 겹쳐 복원을 중단했어요. 기존 기록은 유지됩니다.');
    if (remote.deleted) {
      if (kind === 'run') await tx.runAsync('DELETE FROM running_points WHERE run_id=? AND EXISTS(SELECT 1 FROM running_sessions WHERE id=? AND owner_id=?)', id, id, owner);
      await tx.runAsync(`DELETE FROM ${tableFor(kind)} WHERE id=? AND owner_id=?`, id, owner);
    } else {
      if (payload === null) throw new SyncError('복원할 경로 파일이 없어요.');
      const decoded = decodePayload(remote, payload);
      if (decoded.kind === 'course') {
        const s = remote.summary as CourseSummary;
        await tx.runAsync(`INSERT INTO saved_courses(id,name,source,shape,target_km,length_km,score,snapshot_json,snapshot_hash,created_at,updated_at,owner_id)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,source=excluded.source,shape=excluded.shape,
          target_km=excluded.target_km,length_km=excluded.length_km,score=excluded.score,snapshot_json=excluded.snapshot_json,
          snapshot_hash=excluded.snapshot_hash,created_at=excluded.created_at,updated_at=excluded.updated_at`,
        id,s.name,s.source,s.shape,s.targetKm,s.lengthKm,s.score,decoded.json,decoded.hash,s.createdAt,s.updatedAt,owner);
      } else {
        const s = remote.summary as Run;
        const active = await tx.getFirstAsync<{ status: string }>('SELECT status FROM running_sessions WHERE id=?', id);
        if (active && active.status !== 'completed') throw new SyncError('진행 중인 러닝은 서버 기록으로 바꿀 수 없어요.');
        await tx.runAsync(`INSERT INTO running_sessions(id,status,started_at,ended_at,active_ms,checkpoint_at,resumed_at,distance_m,point_count,
          rejected_count,last_timestamp,segment,break_pending,reason,owner_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET status=excluded.status,started_at=excluded.started_at,ended_at=excluded.ended_at,
          active_ms=excluded.active_ms,checkpoint_at=excluded.checkpoint_at,resumed_at=excluded.resumed_at,distance_m=excluded.distance_m,
          point_count=excluded.point_count,rejected_count=excluded.rejected_count,last_timestamp=excluded.last_timestamp,
          segment=excluded.segment,break_pending=excluded.break_pending,reason=excluded.reason`,
        id,s.status,s.startedAt,s.endedAt,s.activeMs,s.checkpointAt,s.resumedAt,s.distanceM,s.pointCount,s.rejectedCount,s.lastTimestamp,s.segment,s.breakPending,s.reason,owner);
        await tx.runAsync('DELETE FROM running_points WHERE run_id=?', id);
        for (const p of decoded.points) await tx.runAsync('INSERT INTO running_points(run_id,sequence,segment,timestamp,latitude,longitude,accuracy) VALUES(?,?,?,?,?,?,?)', id,p.sequence,p.segment,p.timestamp,p.latitude,p.longitude,p.accuracy);
      }
      await tx.runAsync(`UPDATE ${tableFor(kind)} SET remote_version=?,dirty=0,mutation_id=? WHERE id=? AND owner_id=?`, remote.version,remote.mutation_id,id,owner);
    }
    await tx.runAsync('DELETE FROM sync_deletions WHERE owner_id=? AND kind=? AND id=?', owner,kind,id);
    await tx.runAsync('DELETE FROM sync_conflicts WHERE owner_id=? AND kind=? AND id=?', owner,kind,id);
  }
  return {
    status: async (owner: string) => transaction(owner, async tx => {
      const settings = await tx.getFirstAsync<{ enabled: number; last_success: number | null }>('SELECT enabled,last_success FROM sync_accounts WHERE owner_id=?', owner);
      const counts = await tx.getFirstAsync<{ pending: number; guestCourses: number; guestRuns: number; active: number }>(`SELECT
        (SELECT count(*) FROM saved_courses WHERE owner_id=? AND dirty=1)+(SELECT count(*) FROM running_sessions WHERE owner_id=? AND status='completed' AND dirty=1)+(SELECT count(*) FROM sync_deletions WHERE owner_id=?) AS pending,
        (SELECT count(*) FROM saved_courses WHERE owner_id='') AS guestCourses,
        (SELECT count(*) FROM running_sessions WHERE owner_id='' AND status='completed') AS guestRuns,
        (SELECT count(*) FROM running_sessions WHERE status!='completed') AS active`, owner,owner,owner);
      const conflicts = await tx.getAllAsync<{ kind: RecordKind; id: string; remote_json: string }>('SELECT kind,id,remote_json FROM sync_conflicts WHERE owner_id=? ORDER BY kind,id', owner);
      return { enabled: !!settings?.enabled, lastSuccess: settings?.last_success ?? null, ...counts!, conflicts: conflicts.map(c => ({ kind:c.kind,id:c.id,remote:JSON.parse(c.remote_json) as RemoteRecord })) };
    }),
    enable: async (owner: string, claimGuests: boolean) => transaction(owner, async tx => {
      if (claimGuests) {
        if (await tx.getFirstAsync("SELECT id FROM running_sessions WHERE status!='completed'")) throw new SyncError('진행 중인 러닝을 종료한 뒤 기기 기록을 연결해 주세요.');
        await tx.runAsync("UPDATE saved_courses SET owner_id=? WHERE owner_id=''", owner);
        await tx.runAsync("UPDATE running_sessions SET owner_id=? WHERE owner_id='' AND status='completed'", owner);
      }
      await tx.runAsync('INSERT INTO sync_accounts(owner_id,enabled) VALUES(?,1) ON CONFLICT(owner_id) DO UPDATE SET enabled=1', owner);
    }),
    disable: async (owner: string) => transaction(owner, tx => tx.runAsync('UPDATE sync_accounts SET enabled=0 WHERE owner_id=?', owner)),
    pending: async (owner: string): Promise<PendingRecord[]> => transaction(owner, async tx => {
      const rows: PendingRecord[] = [];
      for (const kind of ['course', 'run'] as const) {
        const items = await tx.getAllAsync<Metadata>(`SELECT ${meta} FROM ${tableFor(kind)} WHERE owner_id=? AND dirty=1 ${kind === 'run' ? "AND status='completed'" : ''}
          AND id NOT IN(SELECT id FROM sync_conflicts WHERE owner_id=? AND kind=?) ORDER BY id LIMIT 1`, owner,owner,kind);
        for (const item of items) {
          let summary: CourseSummary | Run, payload: string;
          if (kind === 'course') {
            const data = await tx.getFirstAsync<CourseSummary & { snapshot_json: string; snapshot_hash: string }>(`SELECT ${summaryColumns},snapshot_json,snapshot_hash FROM saved_courses WHERE id=?`, item.id);
            if (!data) throw new Error('Missing course');
            const { snapshot_json, snapshot_hash, ...rest } = data;
            decodeSnapshot(snapshot_json,snapshot_hash); summary=rest; payload=snapshot_json;
          } else {
            summary = (await tx.getFirstAsync<Run>(`SELECT ${runColumns} FROM running_sessions WHERE id=?`, item.id))!;
            payload = JSON.stringify(await tx.getAllAsync<RunPoint>(`SELECT ${pointColumns} FROM running_points WHERE run_id=? ORDER BY sequence`, item.id));
          }
          rows.push({ kind,id:item.id,remoteVersion:item.remoteVersion,mutationId:item.mutationId,deleted:false,summary,payload });
        }
      }
      const deleted = await tx.getAllAsync<Omit<PendingRecord, 'deleted' | 'summary' | 'payload'>>(`SELECT kind,id,remote_version AS remoteVersion,mutation_id AS mutationId FROM sync_deletions
        WHERE owner_id=? AND NOT EXISTS(SELECT 1 FROM sync_conflicts c WHERE c.owner_id=sync_deletions.owner_id AND c.kind=sync_deletions.kind AND c.id=sync_deletions.id) ORDER BY kind,id LIMIT 20`, owner);
      return [...rows,...deleted.map(d => ({ ...d,deleted:true,summary:null,payload:null }))];
    }),
    acknowledge: async (owner: string, sent: PendingRecord, remote: RemoteRecord) => transaction(owner, async tx => {
      // A rename/delete during upload keeps its own mutation and receives the new base version.
      await tx.runAsync(`UPDATE ${tableFor(sent.kind)} SET remote_version=?,dirty=CASE WHEN mutation_id=? THEN 0 ELSE dirty END WHERE owner_id=? AND id=?`, remote.version,sent.mutationId,owner,sent.id);
      await tx.runAsync('UPDATE sync_deletions SET remote_version=? WHERE owner_id=? AND kind=? AND id=?', remote.version,owner,sent.kind,sent.id);
      if (sent.deleted) await tx.runAsync('DELETE FROM sync_deletions WHERE owner_id=? AND kind=? AND id=? AND mutation_id=?',owner,sent.kind,sent.id,sent.mutationId);
    }),
    addConflict: async (owner: string, remote: RemoteRecord) => transaction(owner, tx => conflict(tx,remote)),
    needsPull: async (owner: string, remote: RemoteRecord) => transaction(owner, async tx => {
      const row = await local(tx,owner,remote.kind,remote.record_id), removed = await deletion(tx,owner,remote.kind,remote.record_id);
      if ((row?.remoteVersion ?? removed?.remoteVersion) === remote.version) return false;
      if (row?.dirty || removed) { await conflict(tx,remote); return false; }
      return !!row || !remote.deleted;
    }),
    restore: async (owner: string, remote: RemoteRecord, payload: string | null) => transaction(owner, async tx => {
      const row = await local(tx,owner,remote.kind,remote.record_id), removed = await deletion(tx,owner,remote.kind,remote.record_id);
      if (row?.dirty || removed) { await conflict(tx,remote); return false; }
      await apply(tx,remote,payload); return true;
    }),
    resolve: async (owner: string, selected: SyncConflict, choice: 'local' | 'remote', payload: string | null) => transaction(owner, async tx => {
      const current = await tx.getFirstAsync<{ remote_json: string }>('SELECT remote_json FROM sync_conflicts WHERE owner_id=? AND kind=? AND id=?',owner,selected.kind,selected.id);
      if (!current || current.remote_json !== JSON.stringify(selected.remote)) throw new SyncError('충돌 상태가 바뀌었어요. 새로 확인한 뒤 선택해 주세요.');
      if (choice === 'remote') await apply(tx,selected.remote,payload);
      else {
        await tx.runAsync(`UPDATE ${tableFor(selected.kind)} SET remote_version=?,dirty=1,mutation_id=lower(hex(randomblob(16))) WHERE owner_id=? AND id=?`,selected.remote.version,owner,selected.id);
        await tx.runAsync('UPDATE sync_deletions SET remote_version=?,mutation_id=lower(hex(randomblob(16))) WHERE owner_id=? AND kind=? AND id=?',selected.remote.version,owner,selected.kind,selected.id);
        await tx.runAsync('DELETE FROM sync_conflicts WHERE owner_id=? AND kind=? AND id=?',owner,selected.kind,selected.id);
      }
    }),
    success: async (owner: string, at: number) => transaction(owner, tx => tx.runAsync('UPDATE sync_accounts SET last_success=? WHERE owner_id=?',at,owner)),
    hasActiveRun: () => db.getFirstAsync<{ id: string; owner_id: string }>("SELECT id,owner_id FROM running_sessions WHERE status!='completed'"),
    interruptOtherRuns: (owner: string) => db.withExclusiveTransactionAsync(async tx => {
      if (scope()!==owner) return;
      await tx.runAsync("UPDATE running_sessions SET status='interrupted',break_pending=1,reason='계정이 변경되어 마지막 저장 지점에서 중단했어요. 같은 계정으로 로그인해 재개해 주세요.' WHERE status='running' AND owner_id<>?",owner);
    }),
  };
}
export type SyncRepository = ReturnType<typeof createSyncRepository>;
