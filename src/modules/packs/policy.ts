/** Product decisions supplied on 2026-11-22, not a published legal-policy version. */
export const packPolicy = Object.freeze({
  decisionVersion: '2026-11-22', currency: 'KRW', salesCountry: 'KR', taxIncluded: true,
  minimumAge: 19, expiresAfterDays: null, launchEndsAt: null,
  launchPriceNoticeDays: 14, generalTermsNoticeDays: 7, adverseTermsNoticeDays: 30,
  refundProcessingBusinessDays: 3, inquiryFirstReplyBusinessDays: 3,
});
export type CreditKind = 'generation' | 'save';
export type CreditAmounts = Readonly<{ generation: number; save: number }>;
export class PackPolicyError extends Error { constructor() { super('Invalid purchase balance'); this.name = 'PackPolicyError'; } }
function natural(value: number) { if (!Number.isSafeInteger(value) || value < 0) throw new PackPolicyError(); }
function balances(total: CreditAmounts, remaining: CreditAmounts) {
  for (const kind of ['generation', 'save'] as const) {
    natural(total[kind]); natural(remaining[kind]);
    if (remaining[kind] > total[kind]) throw new PackPolicyError();
  }
}
/** Use actual charged KRW and this purchase's original quantities, never current catalogue prices.
 * BigInt preserves exact fractions; round up only once, then cap against previous refunds. */
export function residualRefundKrw(input: { paidKrw: number; refundedKrw: number; granted: CreditAmounts; remaining: CreditAmounts }): number {
  natural(input.paidKrw); natural(input.refundedKrw); balances(input.granted, input.remaining);
  if (input.refundedKrw > input.paidKrw) throw new PackPolicyError();
  const denominator = 2n * BigInt(input.granted.generation) + BigInt(input.granted.save);
  if (denominator === 0n) throw new PackPolicyError();
  const numerator = BigInt(input.paidKrw) * (2n * BigInt(input.remaining.generation) + BigInt(input.remaining.save));
  const rounded = (numerator + denominator - 1n) / denominator;
  const cap = BigInt(input.paidKrw - input.refundedKrw);
  return Number(rounded < cap ? rounded : cap);
}

export type CreditLot = Readonly<{
  id: string; source: 'free' | 'paid'; acquiredAt: string;
  remaining: CreditAmounts; reserved: CreditAmounts; refundHeld: boolean;
}>;
function validateLots(lots: readonly CreditLot[]) {
  if (new Set(lots.map(lot => lot.id)).size !== lots.length) throw new PackPolicyError();
  for (const lot of lots) {
    if (!lot.id || !['free', 'paid'].includes(lot.source) || !Number.isFinite(Date.parse(lot.acquiredAt)) || typeof lot.refundHeld !== 'boolean') throw new PackPolicyError();
    balances(lot.remaining, lot.reserved);
  }
}
/** Pure allocation decision, to be executed under the future usage transaction's lock.
 * Free allowances/compensation first; paid lots FIFO; held and reserved credits cannot be spent. */
export function nextCreditSource(lots: readonly CreditLot[], kind: CreditKind): string | null {
  validateLots(lots);
  if (kind !== 'generation' && kind !== 'save') throw new PackPolicyError();
  return [...lots].filter(lot => !lot.refundHeld && lot.remaining[kind] > lot.reserved[kind]).sort((a, b) =>
    Number(a.source === 'paid') - Number(b.source === 'paid') || Date.parse(a.acquiredAt) - Date.parse(b.acquiredAt) || a.id.localeCompare(b.id))[0]?.id ?? null;
}
export function availableCredits(lots: readonly CreditLot[]): CreditAmounts {
  validateLots(lots);
  const total = { generation: 0, save: 0 };
  for (const lot of lots.filter(lot => !lot.refundHeld)) for (const kind of ['generation', 'save'] as const) {
    total[kind] += lot.remaining[kind] - lot.reserved[kind]; natural(total[kind]);
  }
  return total;
}
/** An uncertain payment result keeps the refund hold; it is not a confirmed failure. */
export function refundResolution(outcome: 'succeeded' | 'failed' | 'cancelled' | 'unknown') {
  switch (outcome) {
    case 'succeeded': return { hold: false, revokeRemaining: true } as const;
    case 'failed': case 'cancelled': return { hold: false, revokeRemaining: false } as const;
    case 'unknown': return { hold: true, revokeRemaining: false } as const;
    default: throw new PackPolicyError();
  }
}
