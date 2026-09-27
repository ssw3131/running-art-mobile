import { unstable_LowPriority, unstable_scheduleCallback } from 'scheduler';
import { calculateRoute } from '../../modules/route-engine/runner.ts';

// Low priority host tasks let touch/render work run before the next calculation
// slice. Unlike setImmediate (a RN microtask), these yield to the native scheduler.
export const mobileScheduler = {
  now: () => performance.now(),
  yieldToHost: () => new Promise<void>((resolve) => {
    unstable_scheduleCallback(unstable_LowPriority, () => resolve());
  }),
};

export function calculateMobileRoute(...[input, settings]: Parameters<typeof calculateRoute>) {
  return calculateRoute(input, { ...settings, scheduler: mobileScheduler });
}
