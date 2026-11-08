import type { Origin } from '@/modules/route-engine/types';

export type PickedCourseLocation = { origin: Origin; address?: string };
let pending: PickedCourseLocation | null = null;

export function publishCourseLocation(value: PickedCourseLocation) {
  pending = { origin: { ...value.origin }, address: value.address };
}

export function consumeCourseLocation() {
  const value = pending;
  pending = null;
  return value;
}
