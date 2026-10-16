import { useEffect, useState } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { useAuth } from '@/features/auth/use-auth';
import { getStorage } from '@/modules/storage/database';
import { preferencesEvents } from '@/modules/account/preferences-events';
import type { AccountPreferences } from '@/modules/account/model';
import { colors, darkColors } from './tokens';

export function useServiceTheme() {
  const auth = useAuth(), owner = auth.ready ? auth.account?.id ?? '' : null, system = useColorScheme();
  const [saved, setSaved] = useState<{ owner: string | null; theme: AccountPreferences['theme'] }>({ owner: null, theme: 'system' });
  useEffect(() => {
    if (owner === null) return;
    let current = true, sequence = 0;
    const load = async () => {
      const request = ++sequence;
      try {
        const prefs = await (await getStorage()).account.preferences();
        if (current && request === sequence) setSaved({ owner, theme: prefs.theme });
      } catch { /* A transient read failure keeps this owner's last applied palette. */ }
    };
    void load();
    const unsubscribe = preferencesEvents.subscribe(() => void load());
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { current = false; unsubscribe(); listener.remove(); };
  }, [owner]);
  const choice = saved.owner === owner ? saved.theme : 'system';
  const dark = (choice === 'system' ? system : choice) === 'dark';
  return { dark, palette: dark ? darkColors : colors };
}
