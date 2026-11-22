import { BillingError, billingAccountId, isUuid, object, validPurchaseToken, type BillingProduct } from './billing-model.ts';
import { verifyGoogleReceipt } from './billing-google.ts';
import type { BillingBackend } from './billing-backend.ts';

type Options = {
  backend: BillingBackend; readGoogle(token: string): Promise<unknown>;
  products: readonly BillingProduct[]; accountKey: string; testOwners: readonly string[];
  mode?: 'disabled' | 'verify-test-only';
};
/** Not deployed or mounted by this change. Even test mode never enables checkout. */
export function createBillingHandler(options: Options) {
  const { backend, readGoogle, accountKey } = options;
  const owners = new Set(options.testOwners), products = options.products.map(product => ({ ...product }));
  const enabled = options.mode === 'verify-test-only';
  if (enabled && (accountKey.length < 32 || !owners.size || [...owners].some(owner => !isUuid(owner)) || !products.length
    || new Set(products.map(product => product.productId)).size !== products.length
    || products.some(product => !/^[a-z0-9][a-z0-9._]{0,149}$/.test(product.productId) || !['basic', 'plus', 'expanded'].includes(product.packId)))) throw new BillingError('billing_unconfigured');
  return async (request: Request) => {
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    try {
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new BillingError('invalid_request', 400);
      const reader = request.body?.getReader();
      if (!reader) throw new BillingError('invalid_request', 400);
      const decoder = new TextDecoder(); let raw = '', length = 0;
      try { for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > 8192) { await reader.cancel(); throw new BillingError('invalid_request', 400); }
        raw += decoder.decode(value, { stream: true });
      } } finally { reader.releaseLock(); }
      raw += decoder.decode();
      let body: Record<string, unknown>;
      try { body = object(JSON.parse(raw)); } catch { throw new BillingError('invalid_request', 400); }
      const keys: Record<string, readonly string[]> = { capabilities: ['action'], context: ['action'], verify: ['action', 'purchaseToken'], history: ['action', 'cursor'] };
      if (typeof body.action !== 'string' || !Object.hasOwn(keys, body.action) || Object.keys(body).some(key => !keys[body.action as string].includes(key))) throw new BillingError('invalid_request', 400);
      if (body.action === 'verify' && !validPurchaseToken(body.purchaseToken)) throw new BillingError('invalid_request', 400);
      if (body.action === 'history' && body.cursor !== undefined && body.cursor !== null && !isUuid(body.cursor)) throw new BillingError('invalid_request', 400);
      if (!enabled) return body.action === 'capabilities' ? reply({ checkoutEnabled: false, verificationEnabled: false }) : reply({ error: 'billing_disabled' }, 503);
      const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
      const owner = await backend.authenticate(token);
      if (!owners.has(owner)) throw new BillingError('test_account_required', 403);
      await backend.assertEligible(owner);
      if (body.action === 'capabilities') return reply({ checkoutEnabled: false, verificationEnabled: true });
      if (body.action === 'history') return reply(await backend.history(owner, body.cursor as string | null ?? null));
      const accountId = await billingAccountId(owner, accountKey);
      if (body.action === 'context') return reply({ checkoutEnabled: false, obfuscatedAccountId: accountId, products });
      const purchaseToken = body.purchaseToken as string;
      const receipt = await verifyGoogleReceipt(await readGoogle(purchaseToken), purchaseToken, accountId, products);
      return reply(await backend.record(owner, receipt));
    } catch (error) { return reply({ error: error instanceof BillingError ? error.code : 'billing_unavailable' }, error instanceof BillingError ? error.status : 503); }
  };
}
