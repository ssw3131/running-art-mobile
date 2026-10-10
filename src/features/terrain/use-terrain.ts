import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { createTerrainController } from '@/modules/terrain/controller';
import { terrainDirection, terrainFeatures, type Coordinate } from '@/modules/terrain/model';

export function useTerrain(route: Coordinate[] | undefined) {
  const controller = useMemo(() => createTerrainController(route ?? [], process.env.EXPO_PUBLIC_MAPTILER_API_KEY), [route]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  useFocusEffect(useCallback(() => {
    const subscription = AppState.addEventListener('change', next => { if (next !== 'active') controller.hide(); });
    return () => { subscription.remove(); controller.hide(); };
  }, [controller]));
  const geometry = useMemo(() => state.profile ? {
    segments: terrainFeatures(state.profile), direction: terrainDirection(state.profile), origin: state.profile.points[0].coordinate,
  } : undefined, [state.profile]);
  const overlay = state.status === 'ready' && state.profile && geometry ? {
    ...geometry, selected: state.profile.points[state.selected].coordinate,
  } : undefined;
  return { controller, state, overlay };
}
