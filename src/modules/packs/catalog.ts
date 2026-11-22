/** Display-only catalogue. No store product IDs, payment calls or allowance writes. */
export type PackId = 'basic' | 'plus' | 'expanded';
export type Pack = Readonly<{
  id: PackId; name: string; description: string; priceKrw: number;
  generation: number; save: number; recommended?: boolean;
}>;
export const signupBenefits = Object.freeze({ generation: 5, save: 10 });
export const packCatalog: readonly Pack[] = Object.freeze([
  Object.freeze({ id: 'basic', name: '기본 팩', description: '가볍게 더 만들어보고 싶을 때', priceKrw: 1900, generation: 10, save: 20 }),
  Object.freeze({ id: 'plus', name: '플러스 팩', description: '가장 균형 있는 러닝 확장 팩', priceKrw: 2900, generation: 30, save: 60, recommended: true }),
  Object.freeze({ id: 'expanded', name: '확장 팩', description: '많이 달리고, 많이 남기고 싶을 때', priceKrw: 4900, generation: 60, save: 120 }),
]);
export const formatPackPrice = (priceKrw: number) => `${priceKrw.toLocaleString('ko-KR')}원`;

/** UI input only: a future trusted purchase verifier must supply this snapshot.
 * Never construct from navigation params or selection, and never grant from this view.
 * Snapshot values preserve what was actually bought if the catalogue later changes.
 */
export type ConfirmedPackPurchase = Readonly<{
  state: 'confirmed'; orderId: string; purchasedAt: string; pack: Pack;
}>;
