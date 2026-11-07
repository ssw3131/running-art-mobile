import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { reverseGeocode } from '@/modules/map/place-search';
import type { Origin } from '@/modules/route-engine/types';

/** Resolve only the settled point; stale responses must never label another point. */
export function usePointAddress(origin: Origin | undefined, knownAddress = '') {
  const lat = origin?.lat, lng = origin?.lng, key = `${lat},${lng}`;
  const [state, setState] = useState({ key: '', address: '', failed: false });
  useFocusEffect(useCallback(() => {
    if (knownAddress || lat === undefined || lng === undefined) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void reverseGeocode({ lat, lng }, process.env.EXPO_PUBLIC_MAPTILER_API_KEY, controller.signal).then(address => {
        if (!controller.signal.aborted) setState({ key: `${lat},${lng}`, address, failed: false });
      }, () => { if (!controller.signal.aborted) setState({ key: `${lat},${lng}`, address: '', failed: true }); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [lat, lng, knownAddress]));
  const address = knownAddress || (state.key === key ? state.address : '');
  return { address, label: address || (state.key === key && state.failed ? '주소를 확인하지 못했어요.' : '주소 확인 중…') };
}
