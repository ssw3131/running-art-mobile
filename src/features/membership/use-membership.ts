import { useSyncExternalStore } from 'react';
import { membership } from '@/modules/membership/runtime';
export function useMembership() {
  return useSyncExternalStore(membership.subscribe, membership.getSnapshot, membership.getSnapshot);
}
