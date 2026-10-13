import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@/features/auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { storageErrorMessage } from '@/modules/storage/types';
import type { HomeData } from '@/modules/home/model';

export type HomeLoad = { owner: string; data: HomeData | null; error: string };
export function useHome() {
  const auth = useAuth(), owner = auth.ready ? auth.account?.id ?? '' : null;
  const [state, setState] = useState<HomeLoad>({ owner: '', data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    if (owner === null) return;
    let current = true, busy = false;
    setState({ owner, data: null, error: '' });
    const refresh = async () => {
      if (busy || !current || AppState.currentState !== 'active') return;
      busy = true;
      try {
        if (Platform.OS !== 'android') throw new Error('Android home storage unavailable');
        const data = await (await getStorage()).home.read();
        if (current && data.owner === owner) setState({ owner, data, error: '' });
      } catch (error) {
        if (current) setState({ owner, data: null, error: Platform.OS === 'android' ? storageErrorMessage(error) : '홈 기록은 Android 앱에서 확인해 주세요.' });
      } finally { busy = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    const listener = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });
    return () => { current = false; clearInterval(timer); listener.remove(); };
  // Explicit retry re-enters the focused load lifecycle, including its cleanup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, attempt]));
  // Hide the preceding account's data in the very render that changes ownership.
  return { ...(owner !== null && state.owner === owner ? state : { owner: '', data: null, error: '' }), retry: () => setAttempt(value => value + 1) };
}
