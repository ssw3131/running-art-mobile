export type RunStatus = 'running' | 'paused' | 'interrupted' | 'completed';
export type Run = {
  id: string; status: RunStatus; startedAt: number; endedAt: number | null;
  activeMs: number; checkpointAt: number; distanceM: number; pointCount: number;
  rejectedCount: number; lastTimestamp: number; segment: number; breakPending: number;
  resumedAt: number; reason: string | null;
};
export type Fix = { timestamp: number; latitude: number; longitude: number; accuracy: number | null };
export type RunPoint = Fix & { sequence: number; segment: number };
export class RunError extends Error {}
export function runErrorMessage(error: unknown) {
  return error instanceof RunError ? error.message : '러닝 기록을 처리하지 못했어요. 저장 공간·위치 설정을 확인한 뒤 다시 시도해 주세요.';
}
export function validateId(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new RunError('러닝 기록 주소가 올바르지 않아요.');
  return id;
}
export function distanceMeters(a: Fix, b: Fix) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
// Conservative initial thresholds; field accuracy/battery validation remains separate.
export const MAX_GAP_MS = 15000;
export const MAX_ACCURACY_M = 50;
export function classifyFix(run: Run, last: RunPoint | null, fix: Fix, receivedAt: number):
  { kind: 'ignore' } | { kind: 'reject' } | { kind: 'stationary' } | { kind: 'point'; distance: number; segment: number } {
  if (!Number.isFinite(fix.timestamp) || fix.timestamp <= run.lastTimestamp || fix.timestamp < run.resumedAt) return { kind: 'ignore' };
  if (![fix.latitude, fix.longitude, fix.accuracy].every(v => typeof v === 'number' && Number.isFinite(v)) ||
      Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180 || fix.accuracy! < 0 || fix.accuracy! > MAX_ACCURACY_M ||
      fix.timestamp > receivedAt + 5000 || receivedAt - fix.timestamp > 60000) return { kind: 'reject' };
  if (!last || run.breakPending || fix.timestamp - last.timestamp > MAX_GAP_MS) {
    return { kind: 'point', distance: 0, segment: last ? run.segment + 1 : 0 };
  }
  const distance = distanceMeters(last, fix);
  if (distance / ((fix.timestamp - last.timestamp) / 1000) > 12) return { kind: 'reject' };
  const jitter = Math.max(3, Math.min(10, (last.accuracy! + fix.accuracy!) / 4));
  if (distance < jitter) return { kind: 'stationary' };
  return { kind: 'point', distance, segment: run.segment };
}
export function elapsedMs(run: Run, now: number) {
  return run.activeMs + (run.status === 'running' ? Math.max(0, now - run.checkpointAt) : 0);
}
export function durationLabel(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor(seconds / 60 % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export function paceLabel(ms: number, distance: number) {
  if (distance < 10 || ms <= 0) return '—';
  const seconds = Math.round(ms / distance);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')} /km`;
}
export const statusLabel: Record<RunStatus, string> = { running: '러닝 중', paused: '일시정지', interrupted: '기록 중단', completed: '완료' };
