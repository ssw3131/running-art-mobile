import type { PackId } from './catalog.ts';

/** Receipt verification is not delivery. These values must never open the completion view. */
export type PurchaseReceipt = Readonly<{
  purchaseId: string; productId: string; packId: PackId;
  state: 'pending' | 'verified' | 'cancelled'; deliveryState: 'not_granted';
  purchasedAt: string | null; orderId: string | null; testPurchase: true;
}>;
export type PurchaseHistoryPage = Readonly<{ purchases: readonly PurchaseReceipt[]; nextCursor: string | null }>;
export class PurchaseReadError extends Error {
  constructor() { super('구매 내역을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'); this.name = 'PurchaseReadError'; }
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function parsePurchaseReceipt(value: unknown): PurchaseReceipt {
  const v = object(value);
  if (!uuid(v.purchaseId) || typeof v.productId !== 'string' || !/^[a-z0-9][a-z0-9._]{0,149}$/.test(v.productId)
    || !['basic', 'plus', 'expanded'].includes(String(v.packId)) || !['pending', 'verified', 'cancelled'].includes(String(v.state))
    || v.deliveryState !== 'not_granted' || v.testPurchase !== true
    || (v.purchasedAt !== null && (typeof v.purchasedAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(v.purchasedAt) || !Number.isFinite(Date.parse(v.purchasedAt))))
    || (v.state === 'verified' && v.purchasedAt === null)
    || (v.orderId !== null && (typeof v.orderId !== 'string' || v.orderId.length < 1 || v.orderId.length > 256))) throw new PurchaseReadError();
  // Select public fields: never retain accidental raw token/account/server metadata.
  return { purchaseId: v.purchaseId, productId: v.productId, packId: v.packId as PackId, state: v.state as PurchaseReceipt['state'],
    deliveryState: 'not_granted', testPurchase: true, purchasedAt: v.purchasedAt as string | null, orderId: v.orderId as string | null };
}
export function parsePurchaseHistory(value: unknown): PurchaseHistoryPage {
  const v = object(value);
  if (!Array.isArray(v.purchases) || v.purchases.length > 20 || (v.nextCursor !== null && !uuid(v.nextCursor))) throw new PurchaseReadError();
  const purchases = v.purchases.map(parsePurchaseReceipt);
  if (new Set(purchases.map(row => row.purchaseId)).size !== purchases.length
    || (v.nextCursor !== null && (purchases.length !== 20 || v.nextCursor !== purchases.at(-1)?.purchaseId))) throw new PurchaseReadError();
  return { purchases, nextCursor: v.nextCursor as string | null };
}
export const purchaseStateLabel = (receipt: PurchaseReceipt) => ({ pending: '결제 대기 중', verified: '결제 확인 · 팩 적용 전', cancelled: '결제 취소' })[receipt.state];
