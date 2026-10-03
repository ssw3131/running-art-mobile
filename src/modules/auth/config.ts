export const AUTH_REDIRECT_URL = 'runningart://auth/callback';
export const AUTH_STORAGE_KEY = 'running-art-auth-v1';
export const AUTH_PENDING_KEY = 'running-art-auth-pending-v1';

export function authConfig(url: string | undefined, key: string | undefined) {
  const publicKey = key?.trim();
  try {
    const endpoint = new URL(url?.trim() ?? '');
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
        endpoint.pathname !== '/' || endpoint.search || endpoint.hash ||
        !publicKey || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey)) return null;
    return { url: endpoint.origin, key: publicKey };
  } catch { return null; }
}

export type AuthCallback = { code: string } | { error: 'cancelled' | 'invalid' };

export function parseAuthCallback(raw: string): AuthCallback | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'runningart:' || url.hostname !== 'auth' || url.pathname !== '/callback' ||
        url.username || url.password || url.port) return null;
    const error = url.searchParams.get('error') ?? new URLSearchParams(url.hash.slice(1)).get('error');
    if (error) return { error: error === 'access_denied' ? 'cancelled' : 'invalid' };
    const codes = url.searchParams.getAll('code');
    if (url.hash || codes.length !== 1 || !codes[0] || codes[0].length > 4096) return { error: 'invalid' };
    return { code: codes[0] };
  } catch { return null; }
}
