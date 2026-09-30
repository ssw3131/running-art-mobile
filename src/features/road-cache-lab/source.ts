import { checkRoadCacheSignal } from '../../modules/road-data/persistent-cache.ts';
import type { RoadCacheRequest } from '../../modules/road-data/persistent-cache.ts';

export const ROAD_CACHE_LAB_SOURCE = 'lab:windows-loopback/grid-200000';
export const cacheLabSamples = [
  { id: 'seoul-gangnam', label: '서울 강남', origin: { lat: 37.4979, lng: 127.0276 } },
  { id: 'busan-cityhall', label: '부산 시청', origin: { lat: 35.1796, lng: 129.0756 } },
  { id: 'boundary-guro-gwangmyeong', label: '구로·광명 경계', origin: { lat: 37.48, lng: 126.88 } },
] as const;

// Lab-only: fixed adb reverse destination. This is not the production provider.
export function createCacheLabDownloads(fetcher: typeof fetch = fetch, timeoutMs = 30000): Pick<RoadCacheRequest, 'downloadManifest' | 'downloadTile'> {
  async function get(relative: string, maxBytes: number, signal: AbortSignal) {
    checkRoadCacheSignal(signal);
    const controller = new AbortController();
    let rejectInterrupted!: (error: Error) => void;
    const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
    const abort = () => { controller.abort(); rejectInterrupted(new Error('도로 캐시 작업을 취소했어요.')); };
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { controller.abort(); rejectInterrupted(new Error('로컬 표본 응답 시간이 초과됐어요.')); }, timeoutMs);
    try {
      return await Promise.race([interrupted, (async () => {
        const response = await fetcher(`http://127.0.0.1:8766/grid-200000/${relative}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`PC 로컬 표본을 받지 못했어요 (${response.status}).`);
        const declared = Number(response.headers.get('content-length'));
        if (!Number.isSafeInteger(declared) || declared < 1 || declared > maxBytes || response.headers.get('content-encoding')) {
          void response.body?.cancel().catch(() => {});
          throw new Error('로컬 표본의 크기·압축 전송 헤더를 확인해 주세요.');
        }
        // Native fetch may not expose a stream. Header + post-read bounds apply;
        // this fixed loopback source is not the eventual untrusted CDN transport.
        const bytes = new Uint8Array(await response.arrayBuffer());
        checkRoadCacheSignal(signal);
        if (bytes.length !== declared) throw new Error('로컬 표본 전송 크기가 다릅니다.');
        return bytes;
      })()]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
  return { downloadManifest: signal => get('manifest.json', 2 * 1024 * 1024, signal),
    downloadTile: (_manifest, file, signal) => get(file.path, file.bytes, signal) };
}
