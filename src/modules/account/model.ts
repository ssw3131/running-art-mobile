import { StorageError } from '../storage/types.ts';
import { validateGuidanceOptions, type GuidanceOptions } from '../running/guidance.ts';

export type ProfileInput = { nickname: string; picture: 'provider' | 'initials' | 'uploaded' };
export type AccountPreferences = { theme: 'system' | 'light' | 'dark'; guidance: GuidanceOptions };
export const defaultAccountPreferences: AccountPreferences = {
  theme: 'system', guidance: { voice: true, background: true, mode: 'map' },
};
export function validateProfile(value: ProfileInput): ProfileInput {
  const nickname = typeof value?.nickname === 'string' ? value.nickname.normalize('NFC').trim() : '';
  if ([...nickname].length < 1 || [...nickname].length > 20 || /[\p{Cc}\p{Cf}]/u.test(nickname)) {
    throw new StorageError('validation', '닉네임은 공백만 입력할 수 없으며, 줄바꿈 없이 1~20자로 입력해 주세요.');
  }
  if (!['provider', 'initials', 'uploaded'].includes(value.picture)) throw new StorageError('validation', '프로필 사진 표시 방식을 선택해 주세요.');
  return { nickname, picture: value.picture };
}
export function validatePreferences(value: AccountPreferences): AccountPreferences {
  if (!value || !['system', 'light', 'dark'].includes(value.theme)) throw new StorageError('validation', '화면 테마를 선택해 주세요.');
  return { theme: value.theme, guidance: validateGuidanceOptions(value.guidance) };
}
export function profileImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    // Supabase's Kakao user-info request can return this CDN's HTTP URL.
    // Use its HTTPS endpoint while continuing to reject arbitrary HTTP images.
    if (url.protocol === 'http:' && url.hostname === 'k.kakaocdn.net' && !url.port) url.protocol = 'https:';
    return url.protocol === 'https:' ? url.href : null;
  }
  catch { return null; }
}
export function providerLabel(provider: string): string {
  return ({ google: 'Google', kakao: '카카오', 'custom:naver': '네이버' } as Record<string, string>)[provider] ?? '연결 계정';
}
export type AccountStatistics = { courses: number; runs: number; finishedCourses: number; distanceM: number; activeMs: number };
