import { analyzeTerrain, sampleRoute, type Coordinate, type TerrainProfile } from './model.ts';

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
function checkAbort(signal: AbortSignal) {
  if (signal.aborted) { const error = new Error('지형 조회를 취소했어요.'); error.name = 'AbortError'; throw error; }
}
export class TerrainError extends Error {
  readonly code: 'key' | 'quota' | 'network' | 'response' | 'timeout';
  constructor(code: TerrainError['code'], message: string) { super(message); this.code = code; }
}
export function createTerrainLoader(fetcher: Fetcher = fetch, timeoutMs = 20000) {
  const cache = new Map<string, TerrainProfile>();
  return async (route: Coordinate[], key: string | undefined, signal: AbortSignal): Promise<TerrainProfile> => {
    checkAbort(signal);
    if (!key?.trim()) throw new TerrainError('key', '지형 조회 설정을 확인할 수 없어요.');
    const id = JSON.stringify(route), cached = cache.get(id);
    if (cached) { cache.delete(id); cache.set(id, cached); return cached; }
    const sampled = sampleRoute(route), locations = sampled.samples.slice(0, sampled.closed ? -1 : undefined);
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const heights: number[] = [];
      for (let offset = 0; offset < locations.length; offset += 50) {
        checkAbort(controller.signal);
        const batch = locations.slice(offset, offset + 50);
        const query = batch.map(p => p.coordinate.join(',')).join(';');
        const response = await fetcher(`https://api.maptiler.com/elevation/${query}.json?key=${encodeURIComponent(key.trim())}`, {
          signal: controller.signal,
          // Android's default OkHttp disk cache otherwise survives app restarts.
          headers: { 'Cache-Control': 'no-cache, no-store' },
        });
        if (response.status === 429) throw new TerrainError('quota', '지형 조회 한도에 도달했어요. 잠시 후 다시 시도해 주세요.');
        if (response.status === 401 || response.status === 403) throw new TerrainError('key', '현재 지도 서비스 설정에서는 지형을 조회할 수 없어요.');
        if (!response.ok) throw new TerrainError('response', '지형 서비스에서 응답을 받지 못했어요. 다시 시도해 주세요.');
        const data: unknown = await response.json();
        if (!Array.isArray(data) || data.length !== batch.length || data.some((row, i) =>
          !Array.isArray(row) || row.length !== 3 || !row.every(n => typeof n === 'number' && Number.isFinite(n)) ||
          Math.abs(row[0] - batch[i].coordinate[0]) > 1e-6 || Math.abs(row[1] - batch[i].coordinate[1]) > 1e-6 || row[2] < -12000 || row[2] > 10000)) {
          throw new TerrainError('response', '고도 응답이 불완전해요. 다시 시도해 주세요.');
        }
        heights.push(...data.map(row => row[2] as number));
      }
      checkAbort(signal); checkAbort(controller.signal);
      const profile = analyzeTerrain(sampled, heights);
      cache.set(id, profile);
      if (cache.size > 16) cache.delete(cache.keys().next().value!);
      return profile;
    } catch (error) {
      checkAbort(signal);
      if (timedOut) throw new TerrainError('timeout', '지형 조회가 지연되고 있어요. 연결을 확인하고 다시 시도해 주세요.');
      if (error instanceof TerrainError) throw error;
      // Never surface fetch errors containing coordinates or the API key.
      throw new TerrainError('network', '지형을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  };
}
export const loadTerrain = createTerrainLoader();
