import type { Run } from '../running/model.ts';
import { courseShapes } from '../courses/model.ts';

export type AchievementRun = Pick<Run, 'id' | 'status' | 'startedAt' | 'distanceM' | 'activeMs' | 'courseId' | 'courseOutcome'> & { shape: string | null };
export type ShapeBadge = { id: string; shape: string; count: number; firstRunId: string; firstAt: number; latestAt: number };
export type Achievements = { runs: number; finishedCourses: number; distanceM: number; activeMs: number; currentStreak: number; longestStreak: number; activeDays: number; badges: ShapeBadge[] };

/** Local date mapped to an ordinal, so DST's 23/25-hour days remain adjacent. */
export function calendarDay(timestamp: number) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid achievement date');
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

/** Rebuilt from owned records: retries/restores cannot issue duplicate awards. */
export function summarizeAchievements(records: readonly AchievementRun[], now = Date.now()): Achievements {
  const result: Achievements = { runs: 0, finishedCourses: 0, distanceM: 0, activeMs: 0, currentStreak: 0, longestStreak: 0, activeDays: 0, badges: [] };
  const seen = new Set<string>(), days = new Set<number>(), badges = new Map<string, ShapeBadge>();
  const today = calendarDay(now);
  for (const run of [...records].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))) {
    if (seen.has(run.id) || run.status !== 'completed') continue;
    seen.add(run.id);
    if (![run.distanceM, run.activeMs, run.startedAt].every(Number.isFinite) || run.distanceM < 0 || run.activeMs < 0) throw new Error('Invalid achievement record');
    result.runs++; result.distanceM += run.distanceM; result.activeMs += run.activeMs;
    const day = calendarDay(run.startedAt);
    if (run.distanceM > 0 && day <= today) days.add(day);
    if (run.courseOutcome !== 'finished') continue;
    result.finishedCourses++;
    if (!run.courseId || typeof run.shape !== 'string' || !Object.hasOwn(courseShapes, run.shape)) continue;
    const badge = badges.get(run.shape) ?? { id: `shape:${run.shape}`, shape: run.shape, count: 0, firstRunId: run.id, firstAt: run.startedAt, latestAt: run.startedAt };
    badge.count++; badge.latestAt = run.startedAt; badges.set(run.shape, badge);
  }
  let previous = -Infinity, streak = 0;
  for (const day of [...days].sort((a, b) => a - b)) {
    streak = day === previous + 1 ? streak + 1 : 1;
    result.longestStreak = Math.max(result.longestStreak, streak); previous = day;
  }
  result.currentStreak = previous === today || previous === today - 1 ? streak : 0;
  result.activeDays = days.size;
  result.badges = [...badges.values()].sort((a, b) => b.latestAt - a.latestAt || a.id.localeCompare(b.id));
  return result;
}
