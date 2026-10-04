import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { storageErrorMessage } from '@/modules/storage/types';
import { authentication } from '@/modules/auth/runtime';
import { defaultAccountPreferences, type AccountPreferences, type AccountStatistics } from '@/modules/account/model';

export function useAccountData() {
  const auth = useAuth();
  const [preferences, setPreferences] = useState<AccountPreferences>(defaultAccountPreferences);
  const [statistics, setStatistics] = useState<AccountStatistics | null>(null);
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [revision, setRevision] = useState(0);
  const requestKey = `${auth.account?.id ?? 'guest'}/${revision}`;
  const [loadedKey, setLoadedKey] = useState('');
  useFocusEffect(useCallback(() => {
    if (!auth.ready) return;
    let current = true;
    const owner = authentication.getSnapshot().account?.id ?? '';
    setReady(false); setError(''); setStatistics(null); setPreferences(defaultAccountPreferences);
    void (async () => {
      try {
        const store = await getStorage();
        const saved = await store.account.preferences();
        const totals = await store.account.statistics();
        if (current && (authentication.getSnapshot().account?.id ?? '') === owner) { setPreferences(saved); setStatistics(totals); setLoadedKey(requestKey); setReady(true); }
      } catch (cause) { if (current) setError(storageErrorMessage(cause)); }
    })();
    return () => { current = false; };
  }, [auth.ready, requestKey]));
  return { preferences, setPreferences, statistics: loadedKey === requestKey ? statistics : null, error, ready: ready && loadedKey === requestKey, reload: () => setRevision(value => value + 1) };
}
