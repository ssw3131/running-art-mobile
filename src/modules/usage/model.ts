export type UsageKind = 'generation' | 'save';
export type UsageSummary = { version: number; generation: { used: number; total: number }; save: { used: number; total: number } };
export type UsageOperation = { id?: string; state: 'reserved' | 'ready' | 'committed' | 'cancelled' | 'existing' | 'exhausted' | 'deleted'; result?: unknown; courseId?: string };
export type UsageCommand = (action: string, args?: { id?: string; kind?: UsageKind; fingerprint?: string; courseId?: string }) => Promise<UsageOperation | null>;
export type UsageAccess = { command: UsageCommand; uuid(): string };
export class AllowanceError extends Error { constructor(message: string) { super(message); this.name = 'AllowanceError'; } }
export const exhaustedMessage = '사용 가능한 횟수를 모두 사용했어요. 추가 이용권 구매는 준비 중입니다.';
export function parseUsage(value: unknown): UsageSummary {
  const v = value as UsageSummary;
  if (!v || !Number.isSafeInteger(v.version) || !['generation', 'save'].every(key => {
    const row = v[key as UsageKind]; return row && Number.isSafeInteger(row.used) && row.used >= 0 && Number.isSafeInteger(row.total) && row.total >= 0;
  })) throw new AllowanceError('이용 횟수를 확인하지 못했어요. 온라인에서 다시 확인해 주세요.');
  return v;
}
export function assertAllowed(operation: UsageOperation | null) {
  if (operation?.state === 'exhausted') throw new AllowanceError(exhaustedMessage);
  if (!operation || operation.state === 'cancelled') throw new AllowanceError('작업이 취소되었거나 만료됐어요. 다시 시도해 주세요.');
  return operation;
}
