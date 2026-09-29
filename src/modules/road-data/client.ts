import type { Origin, OsmElement } from '../route-engine/types.ts';

export const DEFAULT_ROAD_DATA_URL = 'https://running-art-seoul-mobile.alo-ha.chatgpt.site/api/roads';
export const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
type Bounds = [number, number, number, number]; // south, west, north, east
export type RoadData = { elements: OsmElement[]; source: string; cached: boolean };
export type RoadLoader = (origin: Origin, radiusMeters: number, signal: AbortSignal) => Promise<RoadData>;

// Same spherical bounding rectangle as the v0.2 data provider, without importing the prototype.
export function roadBounds(origin: Origin, radius: number): Bounds {
  if (!Number.isFinite(origin.lat) || Math.abs(origin.lat) > 85 || !Number.isFinite(origin.lng) || Math.abs(origin.lng) > 180 || !Number.isFinite(radius) || radius < 1000 || radius > 10000) {
    throw new Error('이 위치 또는 탐색 반경은 지원하지 않아요. 지도를 이동해 주세요.');
  }
  const angle = radius / 6371000;
  const height = angle * 180 / Math.PI;
  const width = Math.asin(Math.sin(angle) / Math.cos(origin.lat * Math.PI / 180)) * 180 / Math.PI;
  const bounds: Bounds = [origin.lat - height, origin.lng - width, origin.lat + height, origin.lng + width];
  if (bounds[1] < -180 || bounds[3] > 180) throw new Error('날짜 변경선 주변은 아직 지원하지 않아요. 지도를 이동해 주세요.');
  return bounds;
}

function contains(outer: Bounds, inner: Bounds) {
  return outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}
function check(signal: AbortSignal) {
  if (signal.aborted) throw new Error('도로 조회를 취소했어요.');
}

function validElement(element: OsmElement) {
  if (!element || typeof element !== 'object' || typeof element.type !== 'string') return false;
  if (element.type !== 'way') return true;
  return Number.isSafeInteger(element.id) && Array.isArray(element.nodes) && Array.isArray(element.geometry) &&
    element.nodes.length === element.geometry.length && element.nodes.every(Number.isSafeInteger) &&
    element.geometry.every((point) => point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 85 && Number.isFinite(point.lon) && Math.abs(point.lon) <= 180) &&
    (!element.tags || (typeof element.tags === 'object' && !Array.isArray(element.tags) && Object.values(element.tags).every((value) => typeof value === 'string')));
}

type RoadRequest = { url: string; init?: RequestInit; coverage?: Bounds; source?: string };

function requestsFor(endpoint: string, origin: Origin, radius: number, bounds: Bounds, overpassEndpoints: readonly string[]): RoadRequest[] {
  const url = new URL(endpoint);
  url.searchParams.set('lat', String(origin.lat));
  url.searchParams.set('lng', String(origin.lng));
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('dataset', '20260920');
  // Match the provider's spatially indexed, outward-aligned query, with full way geometry.
  const coverage = bounds.map((value, index) => (index < 2 ? Math.floor(value / .02) : Math.ceil(value / .02)) * .02) as Bounds;
  const area = coverage.map((value) => value.toFixed(7)).join(',');
  const query = `[out:json][timeout:20];way["highway"]["highway"!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed)$"]["foot"!~"^(no|private)$"]["access"!~"^(no|private)$"](${area});out geom;`;
  return [{ url: url.toString() }, ...overpassEndpoints.map((provider) => ({
    url: provider, coverage, source: `OpenStreetMap · ${new URL(provider).hostname}`,
    init: { method: 'POST', body: `data=${encodeURIComponent(query)}`, headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'RunningArtMobile/0.1 (https://github.com/ssw3131/running-art-mobile)',
    } },
  }))];
}

// A provider that hangs (even while reading its body) cannot consume the whole lookup.
async function download(request: RoadRequest, fetcher: typeof fetch, signal: AbortSignal, timeoutMs: number) {
  check(signal);
  const controller = new AbortController();
  let abort!: () => void;
  let timer: ReturnType<typeof setTimeout>;
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => { reject(new Error('도로 조회를 취소했어요.')); controller.abort(); };
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { reject(new Error('도로 조회 시간이 초과됐어요. 다시 시도해 주세요.')); controller.abort(); }, timeoutMs);
  });
  try {
    return await Promise.race([interrupted, (async () => {
      const response = await fetcher(request.url, { ...request.init, signal: controller.signal, headers: { Accept: 'application/json', ...request.init?.headers } });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw Object.assign(new Error(response.status === 429 ? '도로 조회 요청이 많아요. 잠시 후 다시 시도해 주세요.' : '도로 데이터를 가져오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'), { status: response.status });
      }
      const body = await response.text();
      check(controller.signal);
      return { response, body };
    })()]);
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener('abort', abort);
  }
}

type RoadLoaderOptions = {
  endpoint?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  attemptTimeoutMs?: number;
  overpassEndpoints?: readonly string[];
  onAttempt?: (event: { provider: string; elapsedMs: number; outcome: 'success' | 'failed'; status?: number }) => void;
};

export function createRoadLoader({ endpoint = DEFAULT_ROAD_DATA_URL, fetcher = fetch, now = Date.now, timeoutMs = 90000, attemptTimeoutMs = 25000,
  // A custom/private provider must explicitly opt in before sending coordinates elsewhere.
  overpassEndpoints = endpoint === DEFAULT_ROAD_DATA_URL ? OVERPASS_ENDPOINTS : [],
  onAttempt,
}: RoadLoaderOptions = {}): RoadLoader {
  const cache: { bounds: Bounds; data: RoadData; expires: number; size: number }[] = [];
  return async (origin, radius, signal) => {
    check(signal);
    const bounds = roadBounds(origin, radius);
    const hit = cache.find((item) => item.expires > now() && contains(item.bounds, bounds));
    if (hit) return { ...hit.data, cached: true };
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      let lastError: unknown;
      for (const request of requestsFor(endpoint, origin, radius, bounds, overpassEndpoints)) {
        check(controller.signal);
        const started = performance.now();
        const report = (outcome: 'success' | 'failed', status?: number) => onAttempt?.({ provider: new URL(request.url).hostname, elapsedMs: Math.round(performance.now() - started), outcome, status });
        try {
          const { response, body } = await download(request, fetcher, controller.signal, attemptTimeoutMs);
          check(controller.signal);
          if (body.length > 20000000) throw new Error('이 지역의 도로 데이터가 너무 커요. 다른 중심 위치를 선택해 주세요.');
          const data = JSON.parse(body) as { elements?: OsmElement[]; remark?: unknown; sourceLabel?: unknown };
          if (data.remark || !Array.isArray(data.elements) || data.elements.length > 100000) throw new Error('완전한 도로 데이터를 받지 못했어요. 다시 조회해 주세요.');
          // Reject corrupt ways before caching them; keep full geometry and OSM node IDs intact.
          for (let index = 0; index < data.elements.length; index++) {
            if (!validElement(data.elements[index])) throw new Error('도로 데이터 형식이 올바르지 않아요.');
            if (index % 1000 === 999) { await new Promise((resolve) => setTimeout(resolve, 0)); check(controller.signal); }
          }
          const result: RoadData = { elements: data.elements, source: typeof data.sourceLabel === 'string' ? data.sourceLabel.slice(0, 160) : request.source ?? 'OpenStreetMap 도로 조회', cached: false };
          const area = response.headers.get('X-Road-Area')?.split(',').map(Number);
          const coverage = area?.length === 4 && area.every(Number.isFinite) && area[0] >= -90 && area[1] >= -180 && area[2] <= 90 && area[3] <= 180 ? area as Bounds : request.coverage ?? bounds;
          if (!contains(coverage, bounds)) throw new Error('선택한 중심 주변을 모두 포함하는 도로 데이터가 아니에요. 다시 조회해 주세요.');
          check(signal);
          if (timedOut) throw new Error('도로 조회 시간이 초과됐어요. 다시 시도해 주세요.');
          cache.unshift({ bounds: coverage, data: result, expires: now() + 15 * 60000, size: body.length });
          while (cache.length > 2 || cache.reduce((sum, item) => sum + item.size, 0) > 20000000) cache.pop();
          report('success', response.status);
          return result;
        } catch (error) {
          check(controller.signal);
          report('failed', error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : undefined);
          lastError = error;
        }
      }
      throw lastError;
    } catch (error) {
      if (signal.aborted) throw new Error('도로 조회를 취소했어요.');
      if (timedOut) throw new Error('도로 조회 시간이 초과됐어요. 다시 시도해 주세요.');
      if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('도로 데이터를 읽지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  };
}
