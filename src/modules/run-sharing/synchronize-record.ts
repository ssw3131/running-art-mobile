import { decodePayload, digest, SyncError, validateRemote } from '../sync/model.ts';
import type { SyncRepository } from '../sync/repository.ts';
import type { SyncRemote } from '../sync/engine.ts';

/** Link sharing uploads this one completed record, without enabling backup or pulling history. */
export async function synchronizeSharedRun({owner,id,repository,remote,check}:{owner:string;id:string;repository:SyncRepository;remote:SyncRemote;check():void}){
  check();const item=await repository.shareRecord(owner,id);check();
  if(!item.dirty&&item.remoteVersion>0)return;
  const hash=digest(item.payload!),path=`${owner}/run/${id}/${hash}.json`;
  decodePayload(validateRemote({owner_id:owner,kind:'run',record_id:id,version:Math.max(1,item.remoteVersion),mutation_id:item.mutationId,deleted:false,summary:item.summary,payload_path:path,payload_hash:hash},owner),item.payload!);
  await remote.upload(path,item.payload!);check();
  const result=await remote.commit(item,path,hash);check();
  const record=validateRemote(result.record,owner);
  if(record.kind!=='run'||record.record_id!==id)throw new SyncError('공유 준비 응답의 기록이 요청과 달라요.');
  if(result.outcome==='conflict'){await repository.addConflict(owner,record);throw new SyncError('이 기록의 동기화 충돌을 먼저 확인해 주세요.');}
  if(result.outcome!=='applied'||record.mutation_id!==item.mutationId||record.deleted)throw new SyncError('공유할 기록의 저장 결과를 확인하지 못했어요.');
  await repository.acknowledge(owner,item,record);check();
}
