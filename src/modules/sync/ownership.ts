import { StorageError } from '../storage/types.ts';

export type OwnerScope = () => string;
export const guestScope: OwnerScope = () => '';
export function ownerId(value: string): string {
  if (value !== '' && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) {
    throw new StorageError('validation', '계정 정보를 확인한 뒤 다시 시도해 주세요.');
  }
  return value;
}
export function requireOwner(scope: OwnerScope, expected?: string): string {
  const owner = ownerId(scope());
  if (!owner || (expected !== undefined && owner !== expected)) {
    throw new StorageError('validation', '계정이 변경되었습니다. 현재 계정에서 다시 시도해 주세요.');
  }
  return owner;
}
