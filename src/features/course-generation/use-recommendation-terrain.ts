import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { loadTerrain } from '@/modules/terrain/client';
import type { Coordinate, TerrainProfile } from '@/modules/terrain/model';

export type RecommendationTerrain = { kind: 'loading' | 'ready' | 'error'; profile?: TerrainProfile };
/** Sequential enrichment never changes candidate order or delays route selection/save. */
export function useRecommendationTerrain(routes: Coordinate[][], enabled: boolean) {
  const [result, setResult] = useState<{ routes: Coordinate[][]; states: RecommendationTerrain[] }>();
  const [attempt, setAttempt] = useState(0), sequence = useRef(0);
  useFocusEffect(useCallback(() => {
    // An explicit retry starts a fresh sequential pass through the shared cache.
    void attempt;
    if (!enabled || !routes.length) return;
    let active: AbortController | undefined;
    const stop = () => { sequence.current++; active?.abort(); };
    const start = () => {
      stop(); const token = sequence.current, controller = new AbortController(); active = controller;
      const states: RecommendationTerrain[] = routes.map(() => ({ kind: 'loading' }));
      setResult({ routes, states: [...states] });
      void (async () => {
        for (let i = 0; i < routes.length; i++) {
          if (controller.signal.aborted) return;
          try {
            const profile = await loadTerrain(routes[i], process.env.EXPO_PUBLIC_MAPTILER_API_KEY, controller.signal);
            states[i] = { kind: 'ready', profile };
          } catch { states[i] = { kind: 'error' }; }
          if (controller.signal.aborted || token !== sequence.current) return;
          setResult({ routes, states: [...states] });
        }
      })();
    };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', state => state === 'active' ? start() : stop());
    return () => { stop(); subscription.remove(); };
  }, [routes, enabled, attempt]));
  return { states: result?.routes === routes ? result.states : [], retry: () => setAttempt(value => value + 1) };
}
