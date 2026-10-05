import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { profileImageUrl } from '../account/model.ts';

type ProfileAuth = Pick<SupabaseClient['auth'], 'getSession' | 'updateUser'>;
type NaverMetadata = { runpen_naver_nickname: string; runpen_naver_avatar_url: string | null };

export function naverProfileMetadata(value: unknown, subject: string): NaverMetadata {
  const body = value as { resultcode?: unknown; response?: { id?: unknown; nickname?: unknown; profile_image?: unknown } } | null;
  const profile = body?.response;
  if (!subject || body?.resultcode !== '00' || profile?.id !== subject) throw new Error('Naver profile identity mismatch');
  const name = typeof profile.nickname === 'string' ? profile.nickname.normalize('NFC').trim() : '';
  if (!name || name.length > 200 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new Error('Naver nickname missing');
  return { runpen_naver_nickname: name, runpen_naver_avatar_url: profileImageUrl(profile.profile_image) };
}

// Naver ID tokens identify the account but omit nickname/photo. Fetch only the
// consented profile, bind it to the verified OIDC subject, and persist display
// fields so SDK refresh/restart does not need a long-lived Naver token.
export async function syncNaverProfile(auth: ProfileAuth, session: Session, fetcher: typeof fetch = fetch): Promise<Session> {
  const identity = session.user.identities?.find(item => item.provider === 'custom:naver');
  const subject: unknown = identity?.identity_data?.sub;
  const token = session.provider_token;
  if (!token || typeof subject !== 'string' || !subject) throw new Error('Naver profile credentials missing');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15000);
  let patch: NaverMetadata;
  try {
    const response = await fetcher('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: abort.signal,
    });
    if (!response.ok) throw new Error('Naver profile request failed');
    patch = naverProfileMetadata(await response.json(), subject);
  } finally { clearTimeout(timer); }
  const current = await auth.getSession();
  if (current.error || current.data.session?.user.id !== session.user.id) throw new Error('Account changed');
  // Never overwrite runpen_nickname, picture selection, uploaded photo or revision.
  const saved = await auth.updateUser({ data: patch });
  if (saved.error || saved.data.user?.id !== session.user.id) throw new Error('Naver profile save failed');
  const restored = await auth.getSession();
  if (restored.error || restored.data.session?.user.id !== session.user.id) throw new Error('Account changed');
  return restored.data.session;
}
