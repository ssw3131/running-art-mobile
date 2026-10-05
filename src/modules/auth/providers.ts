import type { SignInWithOAuthCredentials } from '@supabase/supabase-js';
import { AUTH_REDIRECT_URL } from './config.ts';

export type SignInProvider = 'google' | 'kakao' | 'custom:naver';
export const signInProviderLabels: Record<SignInProvider, string> = {
  google: 'Google', kakao: '카카오', 'custom:naver': '네이버',
};
export function isSignInProvider(value: unknown): value is SignInProvider {
  return value === 'google' || value === 'kakao' || value === 'custom:naver';
}
// Public build flags only, never client secrets. Enable after provider configuration
// and real-account verification; default builds retain the working Google flow.
export function configuredSignInProviders(kakao?: string, naver?: string): SignInProvider[] {
  return ['google', ...(kakao === 'true' ? ['kakao' as const] : []), ...(naver === 'true' ? ['custom:naver' as const] : [])];
}
export function oauthRequest(provider: SignInProvider): SignInWithOAuthCredentials {
  return {
    provider,
    options: { redirectTo: AUTH_REDIRECT_URL, skipBrowserRedirect: true,
      ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
      // Supabase's Kakao defaults include account_email; `scopes` only appends.
      // Replace the provider scope for our no-email app to avoid Kakao KOE205.
      ...(provider === 'kakao' ? { queryParams: { scope: 'profile_nickname profile_image' } } : {}),
    },
  };
}
