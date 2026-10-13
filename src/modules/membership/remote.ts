import type { SupabaseClient } from '@supabase/supabase-js';
import { parseMembership, parsePolicy, type ConsentRequest } from './model.ts';

export function createMembershipRemote(client: Pick<SupabaseClient, 'rpc'>) {
  return {
    async policy() {
      const { data, error } = await client.rpc('get_membership_policy');
      // Older deployed servers remain usable; a missing S1 RPC is not consent.
      if (error?.code === 'PGRST202' || error?.code === '42883') return null;
      if (error) throw error;
      return parsePolicy(data);
    },
    async membership(owner: string) {
      const { data, error } = await client.rpc('get_membership', { p_owner: owner });
      if (error) throw error;
      return parseMembership(data, owner);
    },
    async accept(request: ConsentRequest) {
      const { data, error } = await client.rpc('accept_membership', {
        p_owner: request.owner, p_policy_id: request.policyId, p_terms: request.terms,
        p_privacy: request.privacy, p_request_id: request.requestId,
      });
      if (error) throw error;
      const result = parseMembership(data, request.owner);
      if (!result) throw new Error('Missing membership receipt');
      return result;
    },
  };
}
export type MembershipRemote = ReturnType<typeof createMembershipRemote>;
