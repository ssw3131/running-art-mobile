import { router, useRootNavigationState, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth/use-auth';
import { useMembership } from './use-membership';
import { getStorage } from '@/modules/storage/database';

/** One prompt per account/policy per process; never interrupt an active run. */
export function MembershipPrompt() {
  const auth = useAuth(), state = useMembership(), navigation = useRootNavigationState(), segments = useSegments();
  const prompted = useRef('');
  useEffect(() => { if (!auth.account) prompted.current = ''; }, [auth.account]);
  useEffect(() => {
    if (!navigation?.key || auth.busy || !auth.account || state.owner !== auth.account.id || state.status !== 'required' || !state.policy) return;
    const route = segments.join('/');
    if (route === 'account-signup' || route.startsWith('auth/')) return;
    const key = `${state.owner}/${state.policy.id}`;
    if (prompted.current === key) return;
    let alive = true;
    void getStorage().then(store => store.sync.hasActiveRun()).then(active => {
      if (!alive || active) return;
      prompted.current = key; router.push('/account-signup');
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [auth.account, auth.busy, navigation?.key, segments, state.owner, state.policy, state.status]);
  return null;
}
