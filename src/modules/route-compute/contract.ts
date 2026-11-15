import { SHAPES, validateCustomTemplate, pathLength } from '../route-engine/engine.ts';
import type { Origin, SearchOptions } from '../route-engine/types.ts';
import type { Calculation } from '../route-engine/runner.ts';
import { nationalRegionId } from '../road-data/national-format.ts';

import { generationRadiusKm, isGenerationDistance } from '../route-engine/service-shapes.ts';
import { FIGMA_SHAPE_VERSION } from '../route-engine/figma-contours.ts';

export const COMPUTE_CONTRACT = 'runpen-routes-v1';
export const CURRENT_COMPUTE_CONTRACT = 'runpen-routes-v2';
export const PROXIMITY_COMPUTE_CONTRACT = 'runpen-routes-v3';
type Contract = typeof COMPUTE_CONTRACT | typeof CURRENT_COMPUTE_CONTRACT | typeof PROXIMITY_COMPUTE_CONTRACT;
export const computeContractFor = (options: SearchOptions): Contract => options.proximity ? PROXIMITY_COMPUTE_CONTRACT : options.shapeVersion ? CURRENT_COMPUTE_CONTRACT : COMPUTE_CONTRACT;
export const MAX_REQUEST_BYTES = 16384;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export type ComputeRequest = { contract: Contract; origin: Origin; options: SearchOptions; refresh: boolean };
export type ComputeResponse = Calculation & { contract: Contract; request: ComputeRequest;
  roads: { release: string; manifestHash: string; cached: boolean };
  timing: { roadMs: number; calculationMs: number; totalMs: number } };

export function parseComputeRequest(value: unknown): ComputeRequest {
  const fail = () => { throw new Error('지원하지 않는 코스 계산 조건이에요.'); };
  if (!value || typeof value !== 'object') return fail();
  const data = value as ComputeRequest, o = data.options;
  const nearby = data.contract === PROXIMITY_COMPUTE_CONTRACT;
  const current = nearby || data.contract === CURRENT_COMPUTE_CONTRACT;
  if (nearby ? o?.proximity !== 'nearby-v1' : o?.proximity !== undefined) return fail();
  if ((!current && data.contract !== COMPUTE_CONTRACT) || !data.origin || !Number.isFinite(data.origin.lat) || !Number.isFinite(data.origin.lng) ||
    !o || o.version !== '0.2' || o.mode !== 'free-loop' || !isGenerationDistance(o.targetKm) ||
    typeof data.refresh !== 'boolean') return fail();
  if (current ? o.radiusKm !== generationRadiusKm(o.targetKm) || o.shapeVersion !== FIGMA_SHAPE_VERSION || o.maxRouteKm !== 20
    : o.targetKm > 10 || o.radiusKm !== 2 || o.shape === 'whale' || o.shapeVersion !== undefined || o.maxRouteKm !== undefined) return fail();
  nationalRegionId(data.origin);
  if (o.shape === 'custom') validateCustomTemplate(o.customTemplate!);
  else if (!SHAPES.some(shape => shape.id === o.shape) || o.customTemplate !== undefined) return fail();
  return { contract: data.contract, origin: { lat: data.origin.lat, lng: data.origin.lng },
    options: { version: '0.2', mode: 'free-loop', shape: o.shape, targetKm: o.targetKm, radiusKm: current ? generationRadiusKm(o.targetKm) : 2,
      ...(current ? { shapeVersion: FIGMA_SHAPE_VERSION, maxRouteKm: 20 } : {}),
      ...(nearby ? { proximity: 'nearby-v1' as const } : {}),
      ...(o.shape === 'custom' ? { customTemplate: validateCustomTemplate(o.customTemplate!) } : {}) }, refresh: data.refresh };
}

// The response is untrusted network data. Validate every path the map, save and
// diagnostics screens consume, before exposing it to the existing application.
export function parseComputeResponse(value: unknown, request: ComputeRequest): ComputeResponse {
  const fail = () => { throw new Error('서버 계산 결과를 확인하지 못했어요. 다시 계산해 주세요.'); };
  if (!value || typeof value !== 'object') return fail();
  const data = value as ComputeResponse;
  if (data.contract !== request.contract || JSON.stringify(parseComputeRequest(data.request)) !== JSON.stringify(parseComputeRequest(request))) return fail();
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
    if (request.contract !== COMPUTE_CONTRACT) {
      const length = pathLength(c.route), target = request.options.targetKm * 1000;
      if (length < target * 0.75 || length > Math.min(target * 1.25, 20000) || Math.abs(length / 1000 - c.score.lengthKm) > 1e-6 || c.score.raw < 0 || c.score.raw > 100) return fail();
    }
  }
  if (request.contract === PROXIMITY_COMPUTE_CONTRACT) {
    const p=r.proximity;
    if(!p||!Array.isArray(p.stages)||p.stages.length>3||p.stages.some((n,i)=>n!==[300,500,1000][i])||typeof p.sourceKnown!=='boolean'||typeof p.comparisonRequired!=='boolean'||
      !(p.defaultIndex===null||Number.isInteger(p.defaultIndex)&&p.defaultIndex>=0&&p.defaultIndex<r.candidates.length))return fail();
    for(const c of r.candidates){
      if(!['nearby','shape','far','unknown'].includes(c.recommendation??''))return fail();
      const a=c.approach;
      if(a===null){if(c.recommendation!=='unknown')return fail();continue;}
      if(!p.sourceKnown||!a||!path(a.path)||a.path.length<2||!finite(a.distanceM)||a.distanceM<0||!finite(a.targetM)||a.targetM<0||a.targetM>pathLength(c.route)+1||Math.abs(pathLength(a.path)-a.distanceM)>1||
        !a.source||a.source.from===a.source.to||![a.source.way,a.source.from,a.source.to].every(n=>Number.isSafeInteger(n)&&n>0)||!finite(a.source.start)||!finite(a.source.end)||a.source.start<0||a.source.start>1||a.source.end<0||a.source.end>1||a.source.start===a.source.end||typeof a.source.bidirectional!=='boolean')return fail();
      let m=0,endpoint=c.route.at(-1)!;
      for(let i=1;i<c.route.length;i++){const x=c.route[i-1],y=c.route[i],length=Math.hypot(y.x-x.x,y.y-x.y);if(m+length>=a.targetM){const t=length?(a.targetM-m)/length:0;endpoint={x:x.x+t*(y.x-x.x),y:x.y+t*(y.y-x.y)};break;}m+=length;}
      if(Math.hypot(a.path[0].x,a.path[0].y)>30.01||Math.hypot(endpoint.x-a.path.at(-1)!.x,endpoint.y-a.path.at(-1)!.y)>2)return fail();
      if((c.recommendation==='nearby'&&a.distanceM>1000)||(c.recommendation==='far'&&a.distanceM<=1000))return fail();
    }
    if(p.defaultIndex!==null&&(p.comparisonRequired||!r.candidates[p.defaultIndex].approach||r.candidates[p.defaultIndex].approach!.distanceM>1000))return fail();
  }
  return data;
}
