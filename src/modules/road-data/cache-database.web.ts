import type { RoadCache } from './persistent-cache';

export async function getRoadCache(): Promise<RoadCache> {
  throw new Error('영구 도로 캐시는 Android 앱에서 확인해 주세요.');
}
