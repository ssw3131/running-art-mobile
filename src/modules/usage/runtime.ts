import * as Crypto from 'expo-crypto';
import { authClient, authentication } from '../auth/runtime';
import { AllowanceError, parseUsage, type UsageAccess, type UsageSummary } from './model';
const listeners = new Set<() => void>();
export const usageChanges = { subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, emit() { listeners.forEach(listener => listener()); } };
export async function usageRequest(action: string, args: object = {}) {
  const owner = authentication.getSnapshot().account?.id;
  if (!owner || !authClient) throw new AllowanceError('가입과 로그인을 완료한 뒤 이용해 주세요.');
  const { data, error } = await authClient.functions.invoke('usage', { body: { action, ...args }, timeout: 15000 });
  if (owner !== authentication.getSnapshot().account?.id) throw new AllowanceError('계정이 바뀌었어요. 다시 시도해 주세요.');
  if (error || data?.error) throw new AllowanceError('온라인에서 이용 권한을 확인하지 못했어요. 가입 상태와 네트워크를 확인해 주세요.');
  return data;
}
export const usageAccess: UsageAccess = { uuid: Crypto.randomUUID, async command(action, args) { const data = await usageRequest(action, args); if (action !== 'read') usageChanges.emit(); return data; } };
export async function readUsage(): Promise<UsageSummary> { return parseUsage(await usageRequest('status')); }
