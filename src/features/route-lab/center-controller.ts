import { locateForeground, type LocationProvider, type LocationResult, type Position } from '../../modules/location/locate.ts';
import type { Origin } from '../../modules/route-engine/types.ts';
import { centerFromMap } from '../../modules/map/coordinates.ts';

export type CenterState = {
  center: Origin;
  position: Position | null;
  location: LocationResult | { kind: 'idle' | 'loading' };
  cameraTarget?: { center: Origin; revision: number };
};

export function createCenterController(provider: LocationProvider, initial: Origin, publish: (state: CenterState) => void) {
  let state: CenterState = { center: { ...initial }, position: null, location: { kind: 'idle' } };
  let active: AbortController | null = null;
  let revision = 0;
  const update = (patch: Partial<CenterState>) => { state = { ...state, ...patch }; publish(state); };
  const cancel = () => { active?.abort(); active = null; };
  return {
    get: () => state,
    cancel,
    beginMove() {
      cancel();
      update({ cameraTarget: undefined, ...(state.location.kind === 'loading' ? { location: { kind: 'idle' as const } } : {}) });
    },
    move(center: Origin) { update({ center: { ...center } }); },
    choose(center: Origin) {
      cancel();
      update({ center: { ...center }, location: { kind: 'idle' }, cameraTarget: { center: { ...center }, revision: ++revision } });
    },
    async locate(askPermission = true) {
      cancel();
      const controller = new AbortController();
      active = controller;
      update({ location: { kind: 'loading' } });
      const result = await locateForeground(provider, controller.signal, { askPermission });
      if (active !== controller || controller.signal.aborted) return;
      active = null;
      if (result.kind === 'located') {
        const center = centerFromMap([result.position.longitude, result.position.latitude]);
        if (!center) { update({ location: { kind: 'unavailable' } }); return; }
        update({ center, position: result.position, location: result, cameraTarget: { center, revision: ++revision } });
      } else update({ location: result });
    },
  };
}
