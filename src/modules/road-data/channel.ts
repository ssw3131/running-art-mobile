import { validateManifest } from './file-format.ts';
import type { RoadCodecs, RoadManifest } from './file-format.ts';
import { checkRoadCacheSignal } from './persistent-cache.ts';
import type { RoadCacheRequest } from './persistent-cache.ts';

export const ROAD_PREFIX = 'roads/samples/v1';
export const DEFAULT_ROAD_BASE_URL = 'https://pub-5944210ae37a4e4987dea14ae0f41905.r2.dev';
export const roadSamples = [
  { id: 'seoul-gangnam', label: '서울 강남', origin: { lat: 37.4979, lng: 127.0276 } },
  { id: 'busan-cityhall', label: '부산 시청', origin: { lat: 35.1796, lng: 129.0756 } },
  { id: 'boundary-guro-gwangmyeong', label: '구로·광명', origin: { lat: 37.48, lng: 126.88 } },
  { id: 'pangyo-228-17', label: '판교 228번길 17', origin: { lat: 37.400805, lng: 127.101494 } },
] as const;
const invalid = () => new Error('도로 공급 자료의 버전·크기가 맞지 않아요. 다시 받아 주세요.');
export type RoadFetch = (url: string, init: RequestInit) => Promise<Pick<Response, 'status' | 'headers' | 'body' | 'url' | 'redirected'>>;

export function roadBaseUrl(value = DEFAULT_ROAD_BASE_URL): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('도로 공급 주소는 HTTPS 기본 주소여야 해요.');
  }
  return url.origin;
}
function releaseKey(manifest: Pick<RoadManifest, 'release' | 'gridStepE7'>, hash: string) {
  return `${ROAD_PREFIX}/releases/${manifest.release}-g${manifest.gridStepE7}-${hash}`;
}
type Pointer = { format: string; schemaVersion: number; coverage: string; release: string; gridStepE7: number;
  manifest: { key: string; bytes: number; sha256: string } };
function validatePointer(value: unknown): asserts value is Pointer {
  if (!value || typeof value !== 'object') throw invalid();
  const p = value as Partial<Pointer>;
  if (p.format !== 'running-art-road-channel' || p.schemaVersion !== 1 || p.coverage !== 'samples' ||
    typeof p.release !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(p.release) || p.gridStepE7 !== 200000 ||
    !p.manifest || typeof p.manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(p.manifest.sha256) ||
    !Number.isSafeInteger(p.manifest.bytes) || p.manifest.bytes < 1 || p.manifest.bytes > 2 * 1024 * 1024 ||
    p.manifest.key !== `${releaseKey(p as Pointer, p.manifest.sha256)}/manifest.json`) throw invalid();
}

// The native adapter uses expo/fetch so a body is bounded while reading, never arrayBuffer().
// No credentials, redirects, alternate provider, or server-side route calculation.
export function createRoadHttp(base: string, fetcher: RoadFetch, onRequest?: (url: string) => void) {
  const root = roadBaseUrl(base);
  async function getBody(key: string, maxBytes: number, mime: string, signal: AbortSignal, exact: boolean) {
    checkRoadCacheSignal(signal);
    const url = `${root}/${key}`;
    onRequest?.(url);
    const response = await fetcher(url, { signal, redirect: 'error', credentials: 'omit', headers: { Accept: mime } });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelBody = () => { void reader?.cancel().catch(() => {}); };
    try {
      checkRoadCacheSignal(signal);
      if (response.status !== 200) throw new Error(response.status === 429
        ? '도로 요청이 많아요. 잠시 후 다시 시도해 주세요.' : '도로 파일을 받지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
      if (response.redirected || response.url !== url || response.headers.get('content-encoding') ||
        response.headers.get('content-type')?.split(';')[0].trim() !== mime) throw invalid();
      const declared = Number(response.headers.get('content-length'));
      if (!Number.isSafeInteger(declared) || declared < 1 || declared > maxBytes || (exact && declared !== maxBytes)) throw invalid();
      if (!response.body) throw new Error('도로 파일을 안전하게 읽을 수 없어요. 앱을 업데이트해 주세요.');
      reader = response.body.getReader();
      signal.addEventListener('abort', cancelBody, { once: true });
      const bytes = new Uint8Array(declared);
      let offset = 0;
      while (true) {
        const { done, value } = await reader.read();
        checkRoadCacheSignal(signal);
        if (done) break;
        if (!(value instanceof Uint8Array) || offset + value.length > declared) throw invalid();
        bytes.set(value, offset); offset += value.length;
      }
      if (offset !== declared) throw invalid();
      return bytes;
    } finally {
      signal.removeEventListener('abort', cancelBody);
      if (reader) void reader.cancel().catch(() => {});
      else void response.body?.cancel().catch(() => {});
    }
  }
  async function get(key: string, maxBytes: number, mime: string, signal: AbortSignal, exact = false) {
    checkRoadCacheSignal(signal);
    let reject!: (error: Error) => void;
    const interrupted = new Promise<never>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const abort = () => reject(new Error('도로 조회를 취소했어요.'));
    signal.addEventListener('abort', abort, { once: true });
    try { return await Promise.race([interrupted, getBody(key, maxBytes, mime, signal, exact)]); }
    finally { signal.removeEventListener('abort', abort); }
  }
  return get;
}

export function createRoadChannel(base: string, fetcher: RoadFetch, codecs: RoadCodecs,
  onRequest?: (url: string) => void): Required<Pick<RoadCacheRequest, 'downloadManifest' | 'downloadTile'>> {
  const get = createRoadHttp(base, fetcher, onRequest);
  return {
    async downloadManifest(signal) {
      const pointer: unknown = JSON.parse(codecs.utf8(await get(`${ROAD_PREFIX}/current.json`, 16384, 'application/json', signal)));
      validatePointer(pointer);
      const bytes = await get(pointer.manifest.key, pointer.manifest.bytes, 'application/json', signal, true);
      if (codecs.sha256(bytes) !== pointer.manifest.sha256) throw invalid();
      const manifest: unknown = JSON.parse(codecs.utf8(bytes));
      validateManifest(manifest);
      if (manifest.release !== pointer.release || manifest.gridStepE7 !== pointer.gridStepE7) throw invalid();
      return bytes;
    },
    downloadTile(manifest, file, signal, manifestHash) {
      validateManifest(manifest);
      if (!/^[a-f0-9]{64}$/.test(manifestHash)) throw invalid();
      return get(`${releaseKey(manifest, manifestHash)}/${file.path}`, file.bytes, 'application/gzip', signal, true);
    },
  };
}
