import type { Origin } from '../route-engine/types.ts';

export type PlaceResult = { id: string; name: string; address: string; center: Origin };
export function parsePlaces(value: unknown): PlaceResult[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { features?: unknown }).features)) throw new Error('장소 검색 응답을 확인할 수 없어요.');
  const results: PlaceResult[] = [];
  for (const feature of (value as { features: unknown[] }).features.slice(0, 5)) {
    if (!feature || typeof feature !== 'object') continue;
    const item = feature as { id?: unknown; text?: unknown; place_name?: unknown; center?: unknown; geometry?: { coordinates?: unknown } };
    const coordinates = item.center ?? item.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite)) continue;
    const [lng, lat] = coordinates as number[];
    if (lat < 33 || lat >= 39 || lng < 124 || lng >= 132 || typeof item.place_name !== 'string') continue;
    results.push({ id: String(item.id ?? `${lng},${lat}`), name: typeof item.text === 'string' ? item.text : item.place_name,
      address: item.place_name, center: { lat, lng } });
  }
  return results;
}
export function createPlaceSearch(fetcher: typeof fetch = fetch) {
  return async (query: string, origin: Origin, key: string | undefined, signal: AbortSignal): Promise<PlaceResult[]> => {
    const text = query.trim();
    if (!text || text.length > 120) throw new Error('검색할 장소나 주소를 120자 이내로 입력해 주세요.');
    if (!key?.trim()) throw new Error('장소 검색 설정을 확인할 수 없어요. 지도로 위치를 선택해 주세요.');
    const controller = new AbortController(), abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) controller.abort();
    const timer = setTimeout(abort, 10000);
    try {
      // MapTiler excludes points of interest by default; explicitly include stations/parks.
      const params = new URLSearchParams({ key: key.trim(), language: 'ko', country: 'kr', limit: '5', autocomplete: 'false',
        types: 'poi,address,road,place,municipality,locality,neighbourhood', proximity: `${origin.lng},${origin.lat}` });
      const response = await fetcher(`https://api.maptiler.com/geocoding/${encodeURIComponent(text)}.json?${params}`, {
        signal: controller.signal, credentials: 'omit', headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      if (!response.ok) throw new Error('search');
      return parsePlaces(await response.json());
    } catch {
      // Do not expose URLs, credentials, coordinates or query strings in error logs.
      throw new Error(signal.aborted ? '장소 검색을 취소했어요.' : '장소를 검색하지 못했어요. 연결을 확인하거나 지도로 위치를 선택해 주세요.');
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  };
}
export const searchPlaces = createPlaceSearch();
