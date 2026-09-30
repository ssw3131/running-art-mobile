import type { RoadLoader } from '../../modules/road-data/client.ts';
import { CalculationCancelled, type calculateRoute, type Calculation } from '../../modules/route-engine/runner.ts';
import type { Origin, ProgressCallback, SearchInput, SearchOptions } from '../../modules/route-engine/types.ts';

export type LabCalculation = Calculation & {
  origin: Origin;
  options: SearchOptions;
  liveRoads: boolean;
  source: string;
  cached: boolean;
  timing: { roadMs: number; calculationMs: number; totalMs: number };
};

// One cancellation scope covers road preparation and local calculation, including uncooperative late promises.
export function createLabSession(load: RoadLoader, run: typeof calculateRoute, now = () => performance.now()) {
  let active: AbortController | null = null;
  const cancel = () => { active?.abort(); active = null; };
  return {
    cancel,
    async start(request: { input: SearchInput; liveRoads: boolean }, callbacks: {
      progress: ProgressCallback;
      success(value: LabCalculation): void;
      error(error: Error): void;
    }) {
      cancel();
      const controller = new AbortController();
      active = controller;
      const current = () => active === controller && !controller.signal.aborted;
      const liveRoads = request.liveRoads;
      const input = { ...request.input, origin: { ...request.input.origin }, options: { ...request.input.options } };
      const started = now();
      try {
        const roads = liveRoads ? await load(input.origin, input.options.radiusKm * 1000, controller.signal) : { elements: input.elements, source: '앱에 저장된 고정 표본', cached: false };
        if (!current()) return;
        const ready = now();
        const value = await run({ ...input, elements: roads.elements }, {
          signal: controller.signal,
          onProgress: (value) => { if (current()) callbacks.progress(value); },
        });
        if (!current()) return;
        const finished = now();
        callbacks.success({ ...value, origin: input.origin, options: input.options, liveRoads, source: roads.source, cached: roads.cached, timing: { roadMs: ready - started, calculationMs: finished - ready, totalMs: finished - started } });
      } catch (error) {
        if (current() && !(error instanceof CalculationCancelled)) callbacks.error(error instanceof Error ? error : new Error('코스를 계산하지 못했어요. 다시 시도해 주세요.'));
      } finally { if (current()) active = null; }
    },
  };
}
