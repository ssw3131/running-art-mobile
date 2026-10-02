import type { Origin, OsmElement } from '../route-engine/types.ts';
import { createRoadChannel, DEFAULT_ROAD_BASE_URL, ROAD_PREFIX, roadBaseUrl } from './channel.ts';
import type { RoadFetch } from './channel.ts';
import { checkRoadCacheSignal, RoadCacheError } from './persistent-cache.ts';
import type { RoadCache, RoadCacheRequest, RoadCacheResult } from './persistent-cache.ts';
import { mobileRoadCodecs } from './mobile-codecs.ts';
import { createNationalChannel } from './national-channel.ts';
import { NATIONAL_PREFIX, nationalRegionId } from './national-format.ts';

type Bounds = [number, number, number, number]; // south, west, north, east
export type RoadMode = RoadCacheRequest['mode'];
export type RoadData = { elements: OsmElement[]; source: string; cached: boolean; cache?: Omit<RoadCacheResult, 'elements'> };
export type RoadLoader = (origin: Origin, radiusMeters: number, signal: AbortSignal, mode?: RoadMode) => Promise<RoadData>;

// Same spherical bounding rectangle as the v0.2 data provider.
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

export type RoadAttempt = { provider: string; mode: RoadMode; elapsedMs: number; outcome: 'success' | 'failed';
  requests: number; cache?: Omit<RoadCacheResult, 'elements'> };
type RoadLoaderOptions = {
  getCache: () => Promise<RoadCache>; fetcher: RoadFetch; baseUrl?: string; timeoutMs?: number;
  supply?: 'samples' | 'national';
  yieldToHost?: () => Promise<void>; onAttempt?: (event: RoadAttempt) => void;
};
export function createRoadLoader({ getCache, fetcher, baseUrl = DEFAULT_ROAD_BASE_URL, timeoutMs = 65000,
  yieldToHost, onAttempt, supply = 'samples' }: RoadLoaderOptions): RoadLoader {
  const root = roadBaseUrl(baseUrl);
  return async (origin, radius, signal, mode = 'prefer-cache') => {
    checkRoadCacheSignal(signal);
    const bounds = roadBounds(origin, radius), started = performance.now();
    let regionId: string | undefined;
    try { if (supply === 'national') regionId = nationalRegionId(origin); }
    catch { throw new Error('한국 도로 자료의 지원 범위를 벗어났어요. 지도를 이동해 주세요.'); }
    const source = regionId ? `${root}/${NATIONAL_PREFIX}/current.json#${regionId}` : `${root}/${ROAD_PREFIX}/current.json`;
    const controller = new AbortController();
    let requests = 0, timedOut = false;
    let rejectInterrupted!: (error: Error) => void;
    const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
    const abort = () => { controller.abort(); rejectInterrupted(new Error('도로 조회를 취소했어요.')); };
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); rejectInterrupted(new Error('도로 조회 시간이 초과됐어요. 다시 시도해 주세요.')); }, timeoutMs);
    function report(outcome: RoadAttempt['outcome'], cache?: RoadAttempt['cache']) {
      try { onAttempt?.({ provider: root, mode, elapsedMs: Math.round(performance.now() - started), outcome, requests, cache }); }
      catch { /* Diagnostics do not change the lookup. */ }
    }
    try {
      const result = await Promise.race([interrupted, (async () => {
        const cache = await getCache();
        checkRoadCacheSignal(controller.signal);
        return cache.load({ source, bounds, signal: controller.signal, mode, yieldToHost,
          ...(mode === 'offline' ? {} : regionId
            ? createNationalChannel(root, regionId, fetcher, mobileRoadCodecs, () => { requests++; })
            : createRoadChannel(root, fetcher, mobileRoadCodecs, () => { requests++; })) });
      })()]);
      checkRoadCacheSignal(controller.signal);
      const { elements, ...cache } = result;
      report('success', cache);
      const warning = result.updateFailed ? ' · 갱신 실패로 이전 자료 사용' : result.stale ? ' · 오래된 저장 자료' : '';
      return { elements, cached: result.downloaded === 0, cache,
        source: `OpenStreetMap · 기기 저장 ${result.reused}개 / 새로 받음 ${result.downloaded}개${warning}` };
    } catch (error) {
      report('failed');
      if (signal.aborted) throw new Error('도로 조회를 취소했어요.');
      if (timedOut) throw new Error('도로 조회 시간이 초과됐어요. 다시 시도해 주세요.');
      if (error instanceof RoadCacheError) throw error;
      if (error instanceof Error && error.message === 'ROAD_FILE_MISSING_CELL') {
        throw new Error(supply === 'national' ? '선택한 범위의 도로 목록이 부족해요. 연결 후 다시 받아 주세요.'
          : '아직 도로 자료가 없는 지역이에요. 서울 강남·부산 시청·구로/광명·판교 표본 중심을 선택해 주세요.');
      }
      if (error instanceof SyntaxError || (error instanceof Error && error.message.startsWith('ROAD_FILE_'))) {
        throw new Error('도로 자료 검증에 실패했어요. 연결 후 다시 받아 주세요.');
      }
      if (error instanceof TypeError) throw new Error('도로 자료를 받지 못했어요. 네트워크를 확인하거나 저장한 지역을 오프라인으로 조회해 주세요.');
      throw error;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  };
}
