import { buildGraphSteps, searchSteps, SHAPES, validateCustomTemplate } from './engine.ts';
import type { SearchDiagnostics } from './engine.ts';
import type { ProgressCallback, SearchInput, SearchResult, Steps } from './types.ts';

export class CalculationCancelled extends Error {
  constructor() { super('계산을 취소했어요.'); this.name = 'CalculationCancelled'; }
}

export type CalculationMetrics = {
  elapsedMs: number;
  computeMs: number;
  maxSliceMs: number;
  yields: number;
  nodes: number;
  edges: number;
  routing: SearchDiagnostics;
};
export type Calculation = { result: SearchResult; metrics: CalculationMetrics };
type Scheduler = { now(): number; yieldToHost(): Promise<void> };
const defaultScheduler: Scheduler = {
  now: () => performance.now(),
  yieldToHost: () => new Promise((resolve) => setTimeout(resolve, 0)),
};

function* validateInputSteps(input: SearchInput): Steps<void> {
  const { origin, options, elements } = input;
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || Math.abs(origin.lat) > 85 || Math.abs(origin.lng) > 180) {
    throw new Error('출발 좌표가 올바르지 않아요.');
  }
  if (!options || !Number.isFinite(options.targetKm) || options.targetKm <= 0 || !Number.isFinite(options.radiusKm) || options.radiusKm <= 0) {
    throw new Error('목표 거리와 탐색 반경은 0보다 커야 해요.');
  }
  if (options.version !== '0.2') throw new Error('모바일 계산은 v0.2 기준으로 실행해요.');
  if (options.mode !== undefined && !['anchored', 'free-loop'].includes(options.mode)) throw new Error('지원하지 않는 코스 탐색 방식이에요.');
  if (options.customTemplate) validateCustomTemplate(options.customTemplate);
  else if (!SHAPES.some((shape) => shape.id === options.shape)) throw new Error('지원하지 않는 도형이에요.');
  if (!Array.isArray(elements)) throw new Error('도로 데이터 형식이 올바르지 않아요.');
  for (const element of elements) {
    yield;
    if (element.type !== 'way') continue;
    if (!Number.isSafeInteger(element.id) || !element.nodes || !element.geometry || element.nodes.length !== element.geometry.length ||
      element.nodes.some((id) => !Number.isSafeInteger(id)) || element.geometry.some((p) => !p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 85 || Math.abs(p.lon) > 180)) {
      throw new Error('도로의 노드 ID와 좌표가 올바르지 않아요.');
    }
  }
}

export function validateInput(input: SearchInput) {
  const steps = validateInputSteps(input);
  while (!steps.next().done) { /* Synchronous validation for API callers/tests. */ }
}

// Both graph construction and the actual A*/placement loops have checkpoints.
// This is cooperative JS execution, not a background thread or a server call.
export async function calculateRoute(input: SearchInput, settings: {
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
  scheduler?: Scheduler;
  sliceMs?: number;
} = {}): Promise<Calculation> {
  const scheduler = settings.scheduler ?? defaultScheduler;
  const sliceMs = settings.sliceMs ?? 8;
  if (!Number.isFinite(sliceMs) || sliceMs <= 0) throw new Error('Invalid calculation slice budget.');
  const check = () => { if (settings.signal?.aborted) throw new CalculationCancelled(); };
  check();
  const started = scheduler.now();
  const routing: SearchDiagnostics = { pathRequests: 0, pathCacheHits: 0, pathSearches: 0, pathVisits: 0, maxCachedPaths: 0, maxCachedNodes: 0 };
  const metrics: CalculationMetrics = { elapsedMs: 0, computeMs: 0, maxSliceMs: 0, yields: 0, nodes: 0, edges: 0, routing };
  const measure = (start: number) => {
    const elapsed = scheduler.now() - start;
    metrics.computeMs += elapsed;
    metrics.maxSliceMs = Math.max(metrics.maxSliceMs, elapsed);
  };
  async function drain<T>(steps: Steps<T>): Promise<T> {
    let sliceStart = scheduler.now();
    try {
      while (true) {
        check();
        const next = steps.next();
        if (next.done) { measure(sliceStart); return next.value; }
        if (scheduler.now() - sliceStart >= sliceMs) {
          measure(sliceStart);
          metrics.yields++;
          await scheduler.yieldToHost();
          check();
          sliceStart = scheduler.now();
        }
      }
    } finally {
      steps.return(undefined as never);
    }
  }
  const onProgress: ProgressCallback = (progress) => { check(); settings.onProgress?.(progress); };
  onProgress({ phase: 'graph', text: '보행 도로 연결망을 구성하고 있어요.' });
  await scheduler.yieldToHost();
  check();
  await drain(validateInputSteps(input));
  metrics.yields++;
  await scheduler.yieldToHost();
  check();
  const graph = await drain(buildGraphSteps(input.elements, input.origin, input.options.radiusKm * 1000));
  metrics.nodes = graph.nodes.length;
  metrics.edges = graph.edges.length;
  metrics.yields++;
  await scheduler.yieldToHost();
  check();
  const result = await drain(searchSteps(graph, input.options, onProgress, routing));
  check();
  metrics.elapsedMs = scheduler.now() - started;
  return { result, metrics };
}

// A request generation guards every callback, including already-resolved promises.
// Abort stops work at a checkpoint; generation guards stop stale UI publication.
export function createRouteJobController(run = calculateRoute) {
  let generation = 0;
  let active: AbortController | null = null;
  const cancel = () => { generation++; active?.abort(); active = null; };
  return {
    cancel,
    start(input: SearchInput, callbacks: {
      progress: ProgressCallback;
      success(value: Calculation): void;
      error(error: Error): void;
    }) {
      cancel();
      const request = generation;
      const controller = new AbortController();
      active = controller;
      const current = () => request === generation && !controller.signal.aborted;
      return run(input, { signal: controller.signal, onProgress: (value) => { if (current()) callbacks.progress(value); } })
        .then((value) => { if (current()) callbacks.success(value); })
        .catch((error: unknown) => {
          if (current() && !(error instanceof CalculationCancelled)) callbacks.error(error instanceof Error ? error : new Error('코스 계산에 실패했어요.'));
        }).finally(() => { if (current()) active = null; });
    },
  };
}
