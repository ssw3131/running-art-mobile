import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeletionBackend } from './handler.ts';

export function createDeletionBackend(admin: SupabaseClient): DeletionBackend {
  return {
    async user(token) {
      // getUser validates the bearer with the Auth server. getSession/JWT decoding
      // alone cannot authenticate a destructive operation.
      const { data, error } = await admin.auth.getUser(token);
      if (error) {
        if ([401, 403].includes(error.status ?? 0)) return null;
        throw error;
      }
      return data.user ? { id: data.user.id, anonymous: data.user.is_anonymous === true } : null;
    },
    async begin(owner) {
      const { error } = await admin.rpc('begin_account_deletion', { p_owner: owner });
      if (error) throw error;
    },
    async accountExists(owner) {
      const { data, error } = await admin.auth.admin.getUserById(owner);
      if (error) {
        // A generic 404 could be a gateway/routing failure. Only Auth's explicit
        // user_not_found result proves removal; all other failures stay unknown.
        if (error.status === 404 && error.code === 'user_not_found') return false;
        throw error;
      }
      if (data.user?.id !== owner) throw new Error('Account lookup mismatch');
      return true;
    },
    async files(owner) {
      const { data, error } = await admin.rpc('account_deletion_files', { p_owner: owner });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Missing deletion listing');
      return data;
    },
    async remove(paths) {
      const { error } = await admin.storage.from('personal-records').remove(paths);
      if (error) throw error;
    },
    async deleteUser(owner) {
      // Hard deletion cascades personal_records and the transient deletion marker.
      const { error } = await admin.auth.admin.deleteUser(owner, false);
      if (error) throw error;
    },
    async photos(owner) {
      const { data, error } = await admin.rpc('account_deletion_profile_photos', { p_owner: owner });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Missing photo listing');
      return data;
    },
    async removePhotos(paths) {
      const { error } = await admin.storage.from('profile-photos').remove(paths);
      if (error) throw error;
    },
  };
}
