import { BillingError, isUuid, object, type VerifiedReceipt } from './billing-model.ts';

export type BillingBackend = {
  authenticate(token: string): Promise<string>;
  assertEligible(owner: string): Promise<void>;
  record(owner: string, receipt: VerifiedReceipt): Promise<unknown>;
  history(owner: string, cursor: string | null): Promise<unknown>;
};

export function createBillingBackend(config: { url: string; serviceKey: string }, fetcher: typeof fetch = fetch): BillingBackend {
  const root = config.url.replace(/\/$/, '');
  async function rpc(name: string, body: Record<string, unknown>) {
    try {
      const response = await fetcher(`${root}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: { apikey: config.serviceKey, authorization: `Bearer ${config.serviceKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      if (!response.ok) {
        const problem = object(await response.json().catch(() => null));
        const errors: Record<string, number> = { account_unavailable: 403, membership_required: 403, purchase_owner: 409, purchase_mismatch: 409, consumed_purchase_unknown: 409, invalid_cursor: 400, invalid_receipt: 400 };
        const code = typeof problem.message === 'string' && Object.hasOwn(errors, problem.message) ? problem.message : 'billing_unavailable';
        throw new BillingError(code, errors[code] ?? 503);
      }
      return await response.json();
    } catch (error) { throw error instanceof BillingError ? error : new BillingError('billing_unavailable'); }
  }
  return {
    async authenticate(token) {
      if (!token) throw new BillingError('authentication_required', 401);
      let response;
      try { response = await fetcher(`${root}/auth/v1/user`, { headers: { apikey: config.serviceKey, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000), redirect: 'error' }); }
      catch { throw new BillingError('authentication_unavailable'); }
      if (!response.ok) throw new BillingError(response.status === 401 || response.status === 403 ? 'authentication_required' : 'authentication_unavailable', response.status === 401 || response.status === 403 ? 401 : 503);
      const user = object(await response.json());
      if (!isUuid(user.id) || user.is_anonymous !== false) throw new BillingError('authentication_required', 401);
      return user.id;
    },
    async assertEligible(owner) { await rpc('billing_assert_eligible', { p_owner: owner }); },
    record(owner, receipt) {
      return rpc('billing_record_receipt', { p_owner: owner, p_token_hash: receipt.tokenHash, p_account_id: receipt.accountId,
        p_product_id: receipt.productId, p_pack_id: receipt.packId, p_state: receipt.state,
        p_purchased_at: receipt.purchasedAt, p_order_id: receipt.orderId, p_consumed: receipt.consumed });
    },
    history(owner, cursor) { return rpc('billing_purchase_history', { p_owner: owner, p_cursor: cursor }); },
  };
}
