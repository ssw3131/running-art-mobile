import type { SupabaseClient } from '@supabase/supabase-js';
import { validateProfile, type ProfileInput } from './model.ts';
import { PROFILE_PHOTO_BUCKET, PROFILE_PHOTO_MAX_BYTES, profilePhotoPath, stripJpegMetadata, type PreparedProfilePhoto } from './photo.ts';
import { StorageError } from '../storage/types.ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface ProfilePhotoStore {
  save(owner: string, input: ProfileInput, revision: string | null, currentPath: string | null, photo?: PreparedProfilePhoto): Promise<void>;
}
export function createProfilePhotoStore(client: SupabaseClient, uuid: () => string): ProfilePhotoStore {
  const bucket = client.storage.from(PROFILE_PHOTO_BUCKET);
  let pending: { key: string; id: string } | null = null;
  async function verifyDuplicate(path: string, hash: string) {
    const { data, error } = await bucket.download(path).asStream();
    if (error || !data) throw error ?? new Error('Missing photo');
    const reader = data.getReader(), chunks: Uint8Array[] = [];
    let size = 0, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 30000);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (timedOut) throw new Error('Photo read timeout');
        if (done) break;
        size += value.length;
        if (size > PROFILE_PHOTO_MAX_BYTES) { await reader.cancel(); throw new Error('Photo too large'); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (bytesToHex(sha256(bytes)) !== hash) throw new StorageError('validation', '서버 사진을 확인하지 못했어요. 다른 사진을 선택해 주세요.');
    } finally { clearTimeout(timer); reader.releaseLock(); }
  }
  return {
    async save(owner, input, revision, currentPath, photo) {
      const profile = validateProfile(input);
      let path = profile.picture === 'uploaded' ? profilePhotoPath(owner, currentPath) : null;
      if (photo && profile.picture === 'uploaded') {
        const bytes = stripJpegMetadata(photo.bytes);
        // Prepared photos must already be stripped before hashing and previewing.
        if (bytes.length !== photo.bytes.length || bytes.some((byte, i) => byte !== photo.bytes[i]) || bytesToHex(sha256(bytes)) !== photo.hash) throw new StorageError('validation', '사진을 다시 선택해 주세요.');
        path = profilePhotoPath(owner, `${owner}/${photo.hash}.jpg`);
        if (!path) throw new StorageError('validation', '사진을 다시 선택해 주세요.');
        const { error } = await bucket.upload(path, bytes.slice().buffer, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
        if (error) {
          if (String('statusCode' in error ? error.statusCode : '') !== '409') throw error;
          await verifyDuplicate(path, photo.hash);
        }
      }
      if (profile.picture === 'uploaded' && !path) throw new StorageError('validation', '사용할 사진을 선택해 주세요.');
      const key = JSON.stringify([owner, profile.nickname, profile.picture, path]);
      if (pending?.key !== key) pending = { key, id: uuid() };
      const mutation = pending.id;
      const { data, error } = await client.rpc('save_account_profile', {
        p_owner: owner,
        p_nickname: profile.nickname, p_picture: profile.picture, p_photo_path: path,
        p_expected_revision: revision, p_mutation_id: mutation,
      });
      if (error) throw error;
      if (data?.outcome === 'conflict') { pending = null; throw new StorageError('validation', '다른 곳에서 프로필이 변경됐어요. 프로필을 다시 열고 저장해 주세요.'); }
      if (data?.outcome !== 'applied' || data?.revision !== mutation) throw new Error('Profile response mismatch');
      pending = null;
      // Never delete on an unknown commit outcome. Server RLS also protects the
      // current pointer from delayed cleanup or a concurrent device save.
      if (currentPath && currentPath !== path && profilePhotoPath(owner, currentPath)) {
        await bucket.remove([currentPath]).catch(() => undefined);
      }
      // Retry cleanup of old unreferenced uploads, without touching another
      // device's recent, still-in-flight selection. Current files stay protected.
      try {
        const { data: files } = await bucket.list(owner, { limit: 100, sortBy: { column: 'created_at', order: 'asc' } });
        const expired = (files ?? []).filter(file => !!file.created_at && Date.parse(file.created_at) < Date.now() - 86400_000)
          .map(file => profilePhotoPath(owner, `${owner}/${file.name}`)).filter((file): file is string => !!file && file !== path);
        if (expired.length) await bucket.remove(expired);
      } catch { /* A later successful save or account deletion retries cleanup. */ }
    },
  };
}
