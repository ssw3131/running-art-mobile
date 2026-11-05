import type { Origin } from '@/modules/route-engine/types';

// The selected map point is temporary screen state, not account data. Keep it
// across tab remounts and guest-to-account auth transitions in this JS session.
let rememberedCenter: Origin | null = null;
let automaticLocationAttempted = false;

export function getRememberedCourseCenter(fallback: Origin): Origin {
  return rememberedCenter ?? fallback;
}

export function rememberCourseCenter(origin: Origin): void {
  rememberedCenter = { ...origin };
}

export function shouldLocateCourseOnEntry(): boolean {
  return !automaticLocationAttempted;
}

export function markCourseEntryLocationAttempted(): void {
  automaticLocationAttempted = true;
}
