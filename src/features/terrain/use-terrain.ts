import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { createTerrainController } from '@/modules/terrain/controller';
import { terrainDirection, terrainFeatures, type Coordinate } from '@/modules/terrain/model';

export function useTerrain(route: Coordinate[] | undefined, autoLoad = false) {
  const controller = useMemo(() => createTerrainController(route ?? [], process.env.EXPO_PUBLIC_MAPTILER_API_KEY), [route]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  useFocusEffect(useCallback(() => {
    if (autoLoad && route?.length && AppState.currentState === 'active') void controller.show();
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active') controller.hide();
      else if (autoLoad && route?.length) void controller.show();
    });
    return () => { subscription.remove(); controller.hide(); };
  }, [controller, autoLoad, route]));
  const geometry = useMemo(() => state.profile ? {
    segments: terrainFeatures(state.profile), direction: terrainDirection(state.profile), origin: state.profile.points[0].coordinate,
  } : undefined, [state.profile]);
  const overlay = state.status === 'ready' && state.profile && geometry ? {
    ...geometry, selected: state.profile.points[state.selected].coordinate,
  } : undefined;
  return { controller, state, overlay };
}
