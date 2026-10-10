import type { Origin } from '../route-engine/types.ts';
import type { Bounds } from './file-format.ts';

// Shared by phone and server: same spherical bounds as the v0.2 provider.
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
