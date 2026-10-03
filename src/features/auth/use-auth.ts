import { useSyncExternalStore } from 'react';
import { authentication } from '@/modules/auth/runtime';

export function useAuth() {
  return useSyncExternalStore(authentication.subscribe, authentication.getSnapshot, authentication.getSnapshot);
}
