import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { expoLocationProvider } from '@/modules/location/expo-provider';
import { locateForeground, type LocationResult } from '@/modules/location/locate';

export type LocationState = Exclude<LocationResult, { kind: 'cancelled' }> | { kind: 'idle' | 'loading' };

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({ kind: 'idle' });
  const request = useRef<AbortController | null>(null);
  const focused = useRef(false);
  const hasRequested = useRef(false);

  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
  }, []);

  const locate = useCallback(async (askPermission = true) => {
    if (!focused.current || AppState.currentState === 'background') return;
    cancel();
    hasRequested.current = true;
    const controller = new AbortController();
    request.current = controller;
    setState({ kind: 'loading' });
    const result = await locateForeground(expoLocationProvider, controller.signal, { askPermission });
    if (focused.current && request.current === controller && result.kind !== 'cancelled') {
      request.current = null;
      setState(result);
    }
  }, [cancel]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    let wasBackgrounded = false;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        wasBackgrounded = true;
        cancel();
        setState({ kind: 'idle' });
      } else if (next === 'active' && wasBackgrounded) {
        wasBackgrounded = false;
        // Recheck settings on return, without launching another permission prompt.
        if (hasRequested.current) void locate(false);
      }
    });
    return () => {
      focused.current = false;
      cancel();
      subscription.remove();
    };
  }, [cancel, locate]));

  return { state, locate };
}
