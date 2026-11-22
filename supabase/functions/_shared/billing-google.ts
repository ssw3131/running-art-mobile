import { BillingError, billingPackage, object, purchaseTokenHash, validPurchaseToken, type BillingProduct, type VerifiedReceipt } from './billing-model.ts';

/** Only the trusted Google response is interpreted; device fields never grant anything. */
export async function verifyGoogleReceipt(raw: unknown, token: string, accountId: string, products: readonly BillingProduct[]): Promise<VerifiedReceipt> {
  const value = object(raw), context = object(value.purchaseStateContext);
  if (object(value.testPurchaseContext).fopType !== 'TEST') throw new BillingError('test_purchase_required', 403);
  if (value.regionCode !== 'KR') throw new BillingError('unsupported_sales_country', 403);
  if (!/^[a-f0-9]{64}$/.test(accountId) || value.obfuscatedExternalAccountId !== accountId) throw new BillingError('purchase_account_mismatch', 403);
  const lines = value.productLineItem;
  if (!Array.isArray(lines) || lines.length !== 1) throw new BillingError('unsupported_purchase', 422);
  const line = object(lines[0]), offer = object(line.productOfferDetails);
  const product = products.find(item => item.productId === line.productId);
  if (!product || offer.quantity !== 1 || offer.rentOfferDetails !== undefined || offer.preorderOfferDetails !== undefined) throw new BillingError('unsupported_purchase', 422);
  if (!['PURCHASED', 'PENDING', 'CANCELLED'].includes(String(context.purchaseState))) throw new BillingError('invalid_store_response');
  if (!['CONSUMPTION_STATE_YET_TO_BE_CONSUMED', 'CONSUMPTION_STATE_CONSUMED'].includes(String(offer.consumptionState))) throw new BillingError('invalid_store_response');
  if (offer.refundableQuantity !== undefined && offer.refundableQuantity !== 0 && offer.refundableQuantity !== 1) throw new BillingError('unsupported_purchase', 422);
  const state = context.purchaseState === 'CANCELLED' || (context.purchaseState === 'PURCHASED' && offer.refundableQuantity === 0)
    ? 'cancelled' : context.purchaseState === 'PURCHASED' ? 'verified' : 'pending';
  const at = value.purchaseCompletionTime;
  if ((context.purchaseState === 'PURCHASED' && at === undefined) || (at !== undefined && (typeof at !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(at) || !Number.isFinite(Date.parse(at))))) throw new BillingError('invalid_store_response');
  const order = value.orderId;
  if (order !== undefined && (typeof order !== 'string' || order.length < 1 || order.length > 256)) throw new BillingError('invalid_store_response');
  return {
    tokenHash: await purchaseTokenHash(token), accountId, productId: product.productId, packId: product.packId,
    state, purchasedAt: typeof at === 'string' ? new Date(at).toISOString() : null,
    orderId: typeof order === 'string' ? order : null, consumed: offer.consumptionState === 'CONSUMPTION_STATE_CONSUMED',
  };
}

/** Access token comes from the server runtime identity. No credential or package supplied by the app. */
export function createGooglePurchaseReader(accessToken: () => Promise<string>, fetcher: typeof fetch = fetch) {
  return async (token: string): Promise<unknown> => {
    if (!validPurchaseToken(token)) throw new BillingError('invalid_request', 400);
    try {
      const credential = await accessToken();
      if (!credential) throw new BillingError('billing_unconfigured');
      const response = await fetcher(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${billingPackage}/purchases/productsv2/tokens/${encodeURIComponent(token)}`, {
        headers: { authorization: `Bearer ${credential}` }, redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new BillingError(response.status === 404 || response.status === 400 ? 'purchase_not_found' : 'store_unavailable', response.status === 404 || response.status === 400 ? 422 : 503);
      return await response.json();
    } catch (error) {
      // Provider failures may include token-bearing URLs. Never forward the error/body.
      throw error instanceof BillingError ? error : new BillingError('store_unavailable');
    }
  };
}
