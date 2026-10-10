import { SHAPES, validateCustomTemplate } from '../route-engine/engine.ts';
import type { Origin, SearchOptions } from '../route-engine/types.ts';
import type { Calculation } from '../route-engine/runner.ts';
import { nationalRegionId } from '../road-data/national-format.ts';

export const COMPUTE_CONTRACT = 'runpen-routes-v1';
export const MAX_REQUEST_BYTES = 16384;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export type ComputeRequest = { contract: typeof COMPUTE_CONTRACT; origin: Origin; options: SearchOptions; refresh: boolean };
export type ComputeResponse = Calculation & { contract: typeof COMPUTE_CONTRACT; request: ComputeRequest;
  roads: { release: string; manifestHash: string; cached: boolean };
  timing: { roadMs: number; calculationMs: number; totalMs: number } };

export function parseComputeRequest(value: unknown): ComputeRequest {
  const fail = () => { throw new Error('지원하지 않는 코스 계산 조건이에요.'); };
  if (!value || typeof value !== 'object') return fail();
  const data = value as ComputeRequest, o = data.options;
  if (data.contract !== COMPUTE_CONTRACT || !data.origin || !Number.isFinite(data.origin.lat) || !Number.isFinite(data.origin.lng) ||
    !o || o.version !== '0.2' || o.mode !== 'free-loop' || ![3, 5, 7].includes(o.targetKm) || o.radiusKm !== 2 ||
    typeof data.refresh !== 'boolean') return fail();
  nationalRegionId(data.origin);
  if (o.shape === 'custom') validateCustomTemplate(o.customTemplate!);
  else if (!SHAPES.some(shape => shape.id === o.shape) || o.customTemplate !== undefined) return fail();
  return { contract: COMPUTE_CONTRACT, origin: { lat: data.origin.lat, lng: data.origin.lng },
    options: { version: '0.2', mode: 'free-loop', shape: o.shape, targetKm: o.targetKm, radiusKm: 2,
      ...(o.shape === 'custom' ? { customTemplate: validateCustomTemplate(o.customTemplate!) } : {}) }, refresh: data.refresh };
}

// The response is untrusted network data. Validate every path the map, save and
// diagnostics screens consume, before exposing it to the existing application.
export function parseComputeResponse(value: unknown, request: ComputeRequest): ComputeResponse {
  const fail = () => { throw new Error('서버 계산 결과를 확인하지 못했어요. 다시 계산해 주세요.'); };
  if (!value || typeof value !== 'object') return fail();
  const data = value as ComputeResponse;
  if (data.contract !== COMPUTE_CONTRACT || JSON.stringify(parseComputeRequest(data.request)) !== JSON.stringify(parseComputeRequest(request))) return fail();
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  const point = (p: unknown) => !!p && typeof p === 'object' && finite((p as {x:unknown}).x) && finite((p as {y:unknown}).y);
  const path = (p: unknown) => Array.isArray(p) && p.length <= 20000 && p.every(point);
  const r = data.result, m = data.metrics;
  if (!r || r.version !== '0.2' || r.mode !== 'free-loop' || !point(r.start) || !finite(r.snapMeters) ||
    !r.template || ![r.template.width, r.template.height, r.template.perimeter].every(finite) ||
    !r.stats || !['placements','routed','extraRouted','valid','roads'].every(k => finite(r.stats[k as keyof typeof r.stats])) ||
    !r.baseline || !Array.isArray(r.baseline.candidates) || !finite(r.baseline.valid) || !finite(r.baseline.routed) ||
    !r.baseline.candidates.every(c => c && [c.score,c.raw,c.lengthKm].every(finite)) ||
    !Array.isArray(r.candidates) || r.candidates.length > 5 || !m || !m.routing || typeof m.routing !== 'object' ||
    ![m.elapsedMs,m.computeMs,m.maxSliceMs,m.yields,m.nodes,m.edges].every(n => finite(n) && n >= 0) ||
    !data.timing || !Object.values(data.timing).every(n => finite(n) && n >= 0) ||
    !['roadMs','calculationMs','totalMs'].every(k => finite(data.timing[k as keyof typeof data.timing])) ||
    !data.roads || typeof data.roads.release !== 'string' || !/^[a-f0-9]{64}$/.test(data.roads.manifestHash) || typeof data.roads.cached !== 'boolean') return fail();
  for (const c of r.candidates) {
    if (!c || ![c.rotation,c.scale,c.error,c.loopKm,c.accessKm,c.scaleRatio,c.templatePerimeter].every(finite) || !point(c.offset) ||
      !path(c.target) || !path(c.route) || !path(c.loop) || !Array.isArray(c.access) || !c.access.every(path) ||
      !c.score || !['raw','total','contour','flow','angles','distanceFit','reusePenalty','lengthKm'].every(k => finite(c.score[k as keyof typeof c.score])) ||
      !c.roadInfo || !(c.roadInfo.crowd === null || finite(c.roadInfo.crowd)) || !finite(c.roadInfo.stepsKm) ||
      !Array.isArray(c.roadSegments) || c.roadSegments.length !== c.route.length - 1 ||
      !c.roadSegments.every(s => s && [s.way,s.from,s.to].every(n => Number.isSafeInteger(n) && n > 0) && s.from !== s.to &&
        finite(s.start) && finite(s.end) && s.start >= 0 && s.start <= 1 && s.end >= 0 && s.end <= 1 && s.start !== s.end && s.bidirectional === true)) return fail();
  }
  return data;
}
