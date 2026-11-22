/** Runtime-neutral billing boundary. No checkout, grant or store acknowledgement. */
export class BillingError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 503) { super(code); this.name = 'BillingError'; this.code = code; this.status = status; }
}
export const billingPackage = 'com.runningart.mobile.dev';
export type BillingProduct = Readonly<{ productId: string; packId: 'basic' | 'plus' | 'expanded' }>;
export type VerifiedReceipt = Readonly<{
  tokenHash: string; accountId: string; productId: string; packId: BillingProduct['packId'];
  state: 'pending' | 'verified' | 'cancelled'; purchasedAt: string | null;
  orderId: string | null; consumed: boolean;
}>;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function validPurchaseToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096 && /^[\x21-\x7e]+$/.test(value) && value !== '.' && value !== '..';
}
const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), n => n.toString(16).padStart(2, '0')).join('');
export async function billingAccountId(owner: string, secret: string) {
  if (!isUuid(owner) || secret.length < 32) throw new BillingError('billing_unconfigured');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`runpen-play-account-v1:${owner}`)));
}
export async function purchaseTokenHash(token: string) {
  if (!validPurchaseToken(token)) throw new BillingError('invalid_request', 400);
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
