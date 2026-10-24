export class UsageError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 503) { super(code); this.code = code; this.status = status; }
}
type Identity = { provider?: string; id?: string; identity_data?: { sub?: string; provider_id?: string } };
export async function identityHashes(identities: Identity[], secret: string) {
  if (secret.length < 32) throw new UsageError('usage_unconfigured');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hashes = await Promise.all(identities.filter(identity => identity.provider !== 'email').map(async identity => {
    const subject = identity.identity_data?.sub ?? identity.identity_data?.provider_id;
    if (!identity.provider || !subject || identity.provider === 'email') throw new UsageError('social_identity_required', 403);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(JSON.stringify([identity.provider, subject])));
    return Array.from(new Uint8Array(signature), n => n.toString(16).padStart(2, '0')).join('');
  }));
  if (!hashes.length) throw new UsageError('social_identity_required', 403);
  return [...new Set(hashes)].sort();
}
export function createUsageBackend(config: { url: string; serviceKey: string; identityKey: string }, fetcher: typeof fetch = fetch) {
  const root = config.url.replace(/\/$/, '');
  async function rpc(name: string, body: Record<string, unknown>) {
    const response = await fetcher(`${root}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: config.serviceKey, authorization: `Bearer ${config.serviceKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      const message = typeof problem.message === 'string' ? problem.message : '';
      const known = ['membership_required', 'account_unavailable', 'operation_owner', 'operation_mismatch', 'usage_policy_unavailable'];
      throw new UsageError(known.includes(message) ? message : 'usage_unavailable', problem.code === '42501' ? 403 : 503);
    }
    return response.json();
  }
  return {
    async authenticate(token: string) {
      if (!token) throw new UsageError('authentication_required', 401);
      const response = await fetcher(`${root}/auth/v1/user`, { headers: { apikey: config.serviceKey, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new UsageError('authentication_required', 401);
      const user = await response.json();
      if (!user.id || user.is_anonymous) throw new UsageError('authentication_required', 401);
      await rpc('bind_usage_subject', { p_owner: user.id, p_hashes: await identityHashes(user.identities ?? [], config.identityKey) });
      return user.id as string;
    },
    command(owner: string, action: string, args: { id?: string; kind?: string; fingerprint?: string; result?: unknown; courseId?: string } = {}) {
      return rpc('usage_command', { p_owner: owner, p_action: action, p_id: args.id ?? null, p_kind: args.kind ?? null, p_fingerprint: args.fingerprint ?? null, p_result: args.result ?? null, p_course_id: args.courseId ?? null });
    },
  };
}
export type UsageBackend = ReturnType<typeof createUsageBackend>;
