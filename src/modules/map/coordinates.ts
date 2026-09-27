import type { Origin } from '../route-engine/types.ts';

export function centerFromMap(center: readonly number[]): Origin | null {
  const [lng, lat] = center;
  return Number.isFinite(lng) && Math.abs(lng) <= 180 && Number.isFinite(lat) && Math.abs(lat) <= 85 ? { lat, lng } : null;
}
