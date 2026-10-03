import { decodePayload, digest, SyncError, validateRemote, type PendingRecord, type RecordKind } from './model.ts';
import type { SyncConflict, SyncRepository } from './repository.ts';

export interface SyncRemote {
  upload(path: string, payload: string): Promise<void>;
  download(path: string): Promise<string>;
  commit(item: PendingRecord, path: string | null, hash: string | null): Promise<{ outcome: 'applied' | 'conflict'; record: unknown }>;
  page(kind: RecordKind, after: string): Promise<unknown[]>;
  remove(path: string): Promise<void>;
}
export async function synchronize(deps: { owner: string; repository: SyncRepository; remote: SyncRemote; check: () => void; now?: () => number }) {
  const { owner,repository,remote,check } = deps;
  const stats = { uploaded:0,restored:0,conflicts:0 };
  check();
  if (!(await repository.status(owner)).enabled) throw new SyncError('내 계정에서 동기화를 켜 주세요.');
  // A bounded batch is repeated so an account with more than one page is fully drained.
  for (let batch = 0; batch < 500; batch++) {
    check();
    const pending = await repository.pending(owner);
    if (!pending.length) break;
    for (const item of pending) {
      check();
      const hash = item.payload === null ? null : digest(item.payload);
      const path = hash ? `${owner}/${item.kind}/${item.id}/${hash}.json` : null;
      if (path && item.payload !== null) {
        // Validate locally too; corrupt SQLite data is never uploaded as a successful backup.
        decodePayload(validateRemote({ owner_id:owner,kind:item.kind,record_id:item.id,version:Math.max(1,item.remoteVersion),mutation_id:item.mutationId,
          deleted:false,summary:item.summary,payload_path:path,payload_hash:hash },owner),item.payload);
        await remote.upload(path,item.payload);
      }
      check();
      const result = await remote.commit(item,path,hash);
      check();
      const record = validateRemote(result.record,owner);
      if (record.kind !== item.kind || record.record_id !== item.id) throw new SyncError('서버 응답의 기록이 요청과 달라요.');
      if (result.outcome === 'conflict') { await repository.addConflict(owner,record); stats.conflicts++; continue; }
      if (result.outcome !== 'applied' || record.mutation_id !== item.mutationId || record.deleted !== item.deleted) throw new SyncError('서버 저장 결과를 확인하지 못했어요.');
      // Tombstones retain the former private object path until deletion can be retried.
      if (item.deleted && record.payload_path) await remote.remove(record.payload_path);
      check();
      await repository.acknowledge(owner,item,record); stats.uploaded++;
    }
    if (batch === 499) throw new SyncError('이번 전송 한도에 도달했어요. 남은 기록은 다시 동기화해 주세요.');
  }
  for (const kind of ['course','run'] as const) {
    let after = '';
    for (;;) {
      check();
      const page = await remote.page(kind,after);
      check();
      if (!page.length) break;
      for (const value of page) {
        const row = validateRemote(value,owner);
        if (row.kind !== kind || row.record_id <= after) throw new SyncError('서버 기록 목록 순서를 확인하지 못했어요.');
        after = row.record_id;
        if (!await repository.needsPull(owner,row)) continue;
        check();
        const payload = row.deleted ? null : await remote.download(row.payload_path!);
        check();
        if (await repository.restore(owner,row,payload)) stats.restored++;
      }
    }
  }
  check();
  const final = await repository.status(owner);
  stats.conflicts=final.conflicts.length;
  if (!final.pending && !stats.conflicts) await repository.success(owner,(deps.now ?? Date.now)());
  return stats;
}
export async function resolveConflict(deps: { owner: string; repository: SyncRepository; remote: SyncRemote; conflict: SyncConflict; choice:'local'|'remote'; check:()=>void }) {
  const { owner,repository,remote,conflict,choice,check } = deps;
  check();
  const row=validateRemote(conflict.remote,owner);
  const payload=choice==='remote' && !row.deleted ? await remote.download(row.payload_path!) : null;
  check();
  await repository.resolve(owner,conflict,choice,payload);
}
