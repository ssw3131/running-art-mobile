import { loadTerrain } from './client.ts';
import { reverseTerrain, type Coordinate, type TerrainProfile } from './model.ts';

export type TerrainState = {
  status: 'hidden' | 'loading' | 'ready' | 'error'; profile: TerrainProfile | null;
  reversed: boolean; selected: number; error: string;
};
export function createTerrainController(route: Coordinate[], key: string | undefined, loader = loadTerrain) {
  let state: TerrainState = { status: 'hidden', profile: null, reversed: false, selected: 0, error: '' };
  const listeners = new Set<() => void>(), coordinates = route.map(p => [...p] as Coordinate);
  let request: AbortController | null = null, sequence = 0;
  const publish = (value: TerrainState) => { state = value; listeners.forEach(listener => listener()); };
  function hide() {
    sequence++; request?.abort(); request = null;
    publish({ ...state, status: 'hidden', error: '' });
  }
  return {
    snapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hide,
    async show() {
      if (state.status === 'loading' || state.status === 'ready') return;
      if (state.profile) { publish({ ...state, status: 'ready' }); return; }
      const token = ++sequence, active = new AbortController(); request = active;
      publish({ ...state, status: 'loading', error: '' });
      try {
        const profile = await loader(coordinates, key, active.signal);
        if (token !== sequence || active.signal.aborted) return;
        publish({ status: 'ready', profile, reversed: false, selected: 0, error: '' });
      } catch (error) {
        if (token !== sequence || active.signal.aborted) return;
        publish({ ...state, status: 'error', error: error instanceof Error ? error.message : '지형을 불러오지 못했어요.' });
      } finally { if (token === sequence) request = null; }
    },
    reverse() {
      if (state.status !== 'ready' || !state.profile) return;
      publish({ ...state, profile: reverseTerrain(state.profile), reversed: !state.reversed,
        selected: state.profile.points.length - 1 - state.selected });
    },
    select(index: number) {
      if (state.status === 'ready' && state.profile && Number.isInteger(index) && index >= 0 && index < state.profile.points.length) publish({ ...state, selected: index });
    },
  };
}
export type TerrainController = ReturnType<typeof createTerrainController>;
