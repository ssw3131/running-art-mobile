import { validateProfile } from '../account/model.ts';

export type MembershipPolicy = { id: string; terms: string; privacy: string; publishedAt: string };
export type Membership = { owner: string; policyId: string | null; completedAt: string | null; consentedAt: string | null };
export type ConsentInput = { policyId: string; terms: boolean; privacy: boolean };
export type ConsentRequest = ConsentInput & { owner: string; requestId: string };
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function parsePolicy(value: unknown): MembershipPolicy | null {
  if (value === null) return null;
  const v = value as MembershipPolicy;
  if (!v || !isText(v.id, 80) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(v.id) || !isText(v.terms, 100000) || !isText(v.privacy, 100000)
    || !isDate(v.publishedAt)) throw new Error('Invalid membership policy');
  return { id: v.id, terms: v.terms, privacy: v.privacy, publishedAt: v.publishedAt };
}
export function parseMembership(value: unknown, owner: string): Membership | null {
  if (value === null) return null;
  const v = value as Membership;
  if (!v || v.owner !== owner || !(v.policyId === null && v.completedAt === null && v.consentedAt === null
    || isText(v.policyId, 80) && isDate(v.completedAt) && isDate(v.consentedAt))) throw new Error('Invalid membership response');
  return { owner, policyId: v.policyId, completedAt: v.completedAt, consentedAt: v.consentedAt };
}
export function consentValid(input: ConsentInput, policy: MembershipPolicy): boolean {
  return input.policyId === policy.id && input.terms === true && input.privacy === true;
}
export function suggestedNickname(name: string | null | undefined): string {
  const normalized = (name ?? '').normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return [...normalized].slice(0, 20).join('') || '러너';
}
export function signupNickname(input: string, existing: string | null | undefined): string {
  return validateProfile({ nickname: input.trim() ? input : suggestedNickname(existing), picture: 'provider' }).nickname;
}
