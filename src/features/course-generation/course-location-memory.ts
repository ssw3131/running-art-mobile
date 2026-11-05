import type { Origin } from '@/modules/route-engine/types';

// The selected map point is temporary screen state, not account data. Keep it
// across tab remounts and guest-to-account auth transitions in this JS session.
let rememberedCenter: Origin | null = null;
let automaticLocationAttempted = false;

export function getRememberedCourseCenter(fallback: Origin): Origin {
  const center = rememberedCenter ?? fallback;
  if (__DEV__) console.info('[COURSE_CENTER] restore', JSON.stringify({ remembered: rememberedCenter, fallback, center }));
  return center;
}

export function rememberCourseCenter(origin: Origin): void {
  rememberedCenter = { ...origin };
  if (__DEV__) console.info('[COURSE_CENTER] remember', JSON.stringify(rememberedCenter));
}

export function shouldLocateCourseOnEntry(): boolean {
  return !automaticLocationAttempted;
}

export function markCourseEntryLocationAttempted(): void {
  automaticLocationAttempted = true;
}
