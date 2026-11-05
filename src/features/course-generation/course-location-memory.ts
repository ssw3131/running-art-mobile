import type { Origin } from '@/modules/route-engine/types';

let rememberedCenter: { owner: string | null; origin: Origin } | null = null;

export function getRememberedCourseCenter(owner: string | null, fallback: Origin): Origin {
  return rememberedCenter?.owner === owner ? rememberedCenter.origin : fallback;
}

export function rememberCourseCenter(owner: string | null, origin: Origin): void {
  rememberedCenter = { owner, origin: { ...origin } };
}
