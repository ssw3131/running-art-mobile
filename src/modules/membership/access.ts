import type { MembershipState } from './controller.ts';

/** A session is not a membership receipt; never reuse another owner's result. */
export function membershipAccess(owner: string | null, state: MembershipState): 'guest' | 'signup' | 'service' {
  if (!owner) return 'guest';
  // This cached receipt permits local records only. Every new generation/save
  // still requires the server's current policy and completed membership.
  if (state.owner === owner && state.offlineAvailable && !state.busy &&
      (state.status === 'loading' || state.status === 'error' || state.policyStatus === 'error')) return 'service';
  return state.owner === owner && state.status === 'complete' && !state.busy
    && state.policyStatus === 'ready' && !!state.policy && state.membership?.owner === owner
    && state.membership.policyId === state.policy.id && !!state.membership.completedAt
    ? 'service' : 'signup';
}
