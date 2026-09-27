import type { Origin, OsmElement } from '../route-engine/types.ts';

export const DEFAULT_ROAD_DATA_URL = 'https://running-art-seoul-mobile.alo-ha.chatgpt.site/api/roads';
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

export function createRoadLoader({ endpoint = DEFAULT_ROAD_DATA_URL, fetcher = fetch, now = Date.now, timeoutMs = 90000 } = {}): RoadLoader {
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
      const url = new URL(endpoint);
      url.searchParams.set('lat', String(origin.lat));
      url.searchParams.set('lng', String(origin.lng));
      url.searchParams.set('radius', String(radius));
      url.searchParams.set('dataset', '20260920');
      const response = await fetcher(url.toString(), { signal: controller.signal, headers: { Accept: 'application/json' } });
      check(signal);
      if (!response.ok) throw new Error(response.status === 429 ? '도로 조회 요청이 많아요. 잠시 후 다시 시도해 주세요.' : '도로 데이터를 가져오지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
      const body = await response.text();
      check(signal);
      if (body.length > 20000000) throw new Error('이 지역의 도로 데이터가 너무 커요. 다른 중심 위치를 선택해 주세요.');
      const data = JSON.parse(body) as { elements?: OsmElement[]; remark?: unknown; sourceLabel?: unknown };
      if (data.remark || !Array.isArray(data.elements) || data.elements.length > 100000) throw new Error('완전한 도로 데이터를 받지 못했어요. 다시 조회해 주세요.');
      // Reject corrupt ways before caching them; keep full geometry and OSM node IDs intact.
      for (let index = 0; index < data.elements.length; index++) {
        if (!validElement(data.elements[index])) throw new Error('도로 데이터 형식이 올바르지 않아요.');
        if (index % 1000 === 999) { await new Promise((resolve) => setTimeout(resolve, 0)); check(signal); }
      }
      const result: RoadData = { elements: data.elements, source: typeof data.sourceLabel === 'string' ? data.sourceLabel.slice(0, 160) : 'OpenStreetMap 도로 조회', cached: false };
      const area = response.headers.get('X-Road-Area')?.split(',').map(Number);
      const coverage = area?.length === 4 && area.every(Number.isFinite) && area[0] >= -90 && area[1] >= -180 && area[2] <= 90 && area[3] <= 180 ? area as Bounds : bounds;
      if (!contains(coverage, bounds)) throw new Error('선택한 중심 주변을 모두 포함하는 도로 데이터가 아니에요. 다시 조회해 주세요.');
      check(signal);
      if (timedOut) throw new Error('도로 조회 시간이 초과됐어요. 다시 시도해 주세요.');
      cache.unshift({ bounds: coverage, data: result, expires: now() + 15 * 60000, size: body.length });
      while (cache.length > 2 || cache.reduce((sum, item) => sum + item.size, 0) > 20000000) cache.pop();
      return result;
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
