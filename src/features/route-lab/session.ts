import type { RoadData, RoadLoader, RoadMode } from '../../modules/road-data/client.ts';
import { CalculationCancelled, type calculateRoute, type Calculation } from '../../modules/route-engine/runner.ts';
import type { Origin, ProgressCallback, SearchInput, SearchOptions } from '../../modules/route-engine/types.ts';
import type { RemoteCalculation } from '../../modules/route-compute/client.ts';

export type LabCalculation = Calculation & {
  execution?: 'server' | 'device';
  fallback?: boolean;
  origin: Origin;
  options: SearchOptions;
  liveRoads: boolean;
  source: string;
  cached: boolean;
  roadCache?: RoadData['cache'];
  timing: { roadMs: number; calculationMs: number; totalMs: number };
};

// One cancellation scope covers road preparation and local calculation, including uncooperative late promises.
export function createLabSession(load: RoadLoader, run: typeof calculateRoute, now = () => performance.now(), remote?: RemoteCalculation) {
  let active: AbortController | null = null;
  const cancel = () => { active?.abort(); active = null; };
  return {
    cancel,
    async start(request: { input: SearchInput; liveRoads: boolean; roadMode?: RoadMode; deviceOnly?: boolean }, callbacks: {
      progress: ProgressCallback;
      success(value: LabCalculation): void;
      error(error: Error): void;
    }) {
      cancel();
      const controller = new AbortController();
      active = controller;
      const current = () => active === controller && !controller.signal.aborted;
      const liveRoads = request.liveRoads;
      const input = { ...request.input, origin: { ...request.input.origin }, options: { ...request.input.options,
        ...(request.input.options.customTemplate ? { customTemplate: request.input.options.customTemplate.map(p => ({ ...p })) } : {}) } };
      const started = now();
      try {
        let fallback = false;
        if (remote && liveRoads && !request.deviceOnly && request.roadMode !== 'offline') {
          callbacks.progress({ phase: 'graph', text: '서버에서 주변 도로를 확인하고 코스를 계산하고 있어요.' });
          try {
            const value = await remote(input, controller.signal, request.roadMode === 'refresh');
            if (!current()) return;
            callbacks.success({ result: value.result, metrics: value.metrics, origin: input.origin, options: input.options,
              liveRoads, execution: 'server', source: `OpenStreetMap · 서버 도로 자료 ${value.roads.release}`,
              cached: value.roads.cached, timing: { ...value.timing, totalMs: now() - started } });
            return;
          } catch (error) {
            if (!current() || error instanceof CalculationCancelled) return;
            fallback = true;
            callbacks.progress({ phase: 'graph', text: '서버를 이용할 수 없어 기기에서 계산해요. 시간이 더 걸릴 수 있어요.' });
          }
        }
        if (!current()) return;
        const localStarted = now();
        const roads: RoadData = liveRoads ? await load(input.origin, input.options.radiusKm * 1000, controller.signal, request.roadMode) : { elements: input.elements, source: '앱에 저장된 고정 표본', cached: false };
        if (!current()) return;
        const ready = now();
        const value = await run({ ...input, elements: roads.elements }, {
          signal: controller.signal,
          onProgress: (value) => { if (current()) callbacks.progress(value); },
        });
        if (!current()) return;
        const finished = now();
        callbacks.success({ ...value, origin: input.origin, options: input.options, liveRoads, execution: 'device', fallback, source: roads.source, cached: roads.cached, roadCache: roads.cache, timing: { roadMs: ready - localStarted, calculationMs: finished - ready, totalMs: finished - started } });
      } catch (error) {
        if (current() && !(error instanceof CalculationCancelled)) callbacks.error(error instanceof Error ? error : new Error('코스를 계산하지 못했어요. 다시 시도해 주세요.'));
      } finally { if (current()) active = null; }
    },
  };
}
