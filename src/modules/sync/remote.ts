import type { SupabaseClient } from '@supabase/supabase-js';
import { strFromU8, strToU8 } from 'fflate';
import type { SyncRemote } from './engine.ts';
import { digest, PAYLOAD_BYTES_MAX, SYNC_BUCKET, SyncError } from './model.ts';

export function createSyncRemote(client: SupabaseClient, owner: string): SyncRemote {
  const files = client.storage.from(SYNC_BUCKET);
  async function download(path: string) {
    // React Native's Blob lacks text(); consume the Expo response stream directly.
    const { data,error } = await files.download(path).asStream();
    if (error || !data) throw error ?? new Error('Missing payload');
    const reader=data.getReader();
    const chunks:Uint8Array[]=[];
    let size=0,timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>{});},30000);
    try {
      for (;;) {
        const {done,value}=await reader.read();
        if (timedOut) throw new SyncError('기록 파일 수신 시간이 초과됐어요. 다시 동기화해 주세요.');
        if (done) break;
        if (!(value instanceof Uint8Array)) throw new Error('Invalid payload chunk');
        size+=value.byteLength;
        if (size>PAYLOAD_BYTES_MAX) {
          await reader.cancel();
          throw new SyncError('복원 파일이 허용 크기를 넘었어요.');
        }
        chunks.push(value);
      }
      const bytes=new Uint8Array(size);
      let offset=0;
      for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
      return strFromU8(bytes);
    } finally {clearTimeout(timer);reader.releaseLock();}
  }
  return {
    upload: async (path,payload) => {
      const bytes = strToU8(payload);
      if (bytes.byteLength > PAYLOAD_BYTES_MAX) throw new SyncError('기록 파일이 전송 한도를 넘었어요. 기기 원본은 유지됩니다.');
      const { error } = await files.upload(path,bytes.buffer as ArrayBuffer,{ contentType:'application/json',upsert:false });
      // Immutable hash-addressed uploads can already exist after a lost response.
      if (error) {
        if (!('statusCode' in error && String(error.statusCode)==='409')) throw error;
        if (digest(await download(path))!==digest(payload)) throw new SyncError('서버의 같은 경로 파일이 원본과 달라 전송 완료로 처리하지 않았어요. 기기 원본은 유지됩니다.');
      }
    },
    download,
    commit: async (item,path,hash) => {
      const { data,error } = await client.rpc('commit_personal_record',{
        p_kind:item.kind,p_id:item.id,p_expected_version:item.remoteVersion,p_mutation_id:item.mutationId,
        p_deleted:item.deleted,p_summary:item.summary,p_payload_path:path,p_payload_hash:hash,
      });
      if (error || !data) throw error ?? new Error('Missing commit');
      return data;
    },
    page: async (kind,after) => {
      const { data,error } = await client.from('personal_records').select('owner_id,kind,record_id,version,mutation_id,deleted,summary,payload_path,payload_hash')
        .eq('owner_id',owner).eq('kind',kind).gt('record_id',after).order('record_id').limit(100);
      if (error || !data) throw error ?? new Error('Missing list');
      return data;
    },
    remove: async path => {
      const { error } = await files.remove([path]);
      if (error) throw error;
    },
  };
}
