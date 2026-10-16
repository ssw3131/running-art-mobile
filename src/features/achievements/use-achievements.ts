import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { useAuth } from '@/features/auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { storageErrorMessage } from '@/modules/storage/types';
import type { Achievements } from '@/modules/achievements/model';

export function useAchievements() {
  const auth = useAuth(), owner = auth.ready ? auth.account?.id ?? '' : null;
  const [state, setState] = useState<{ owner: string | null; data: Achievements | null; error: string }>({ owner: null, data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    if (owner === null) return;
    let current = true, busy = false;
    setState({ owner, data: null, error: '' });
    const refresh = async () => {
      if (busy || !current || AppState.currentState !== 'active') return;
      busy = true;
      try {
        const data = await (await getStorage()).achievements.read();
        if (current) setState({ owner, data, error: '' });
      } catch (error) { if (current) setState({ owner, data: null, error: storageErrorMessage(error) }); }
      finally { busy = false; }
    };
    void refresh();
    const listener = AppState.addEventListener('change', value => { if (value === 'active') void refresh(); });
    const timer = setInterval(() => void refresh(), 10000);
    return () => { current = false; listener.remove(); clearInterval(timer); };
    // A retry explicitly re-enters the focused read lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, attempt]));
  return { ...(state.owner === owner && owner !== null ? state : { data: null, error: '' }), retry: () => setAttempt(value => value + 1) };
}
