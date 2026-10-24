import { createHash } from 'node:crypto';
import { createUsageBackend, UsageError } from '../../supabase/functions/_shared/usage-backend.ts';
export function configuredUsage(env = process.env) {
  if (!env.USAGE_SUPABASE_URL || !env.USAGE_SERVICE_ROLE_KEY || !env.USAGE_IDENTITY_HMAC_KEY) return null;
  return createUsageBackend({ url: env.USAGE_SUPABASE_URL, serviceKey: env.USAGE_SERVICE_ROLE_KEY, identityKey: env.USAGE_IDENTITY_HMAC_KEY });
}
export async function reserveCalculation(usage, req, request) {
  if (!usage) throw new UsageError('usage_unconfigured');
  const id = req.headers['x-operation-id'];
  if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new UsageError('operation_required', 400);
  const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? '';
  const owner = await usage.authenticate(token);
  const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const operation = await usage.command(owner, 'reserve', { id, kind: 'generation', fingerprint });
  if (operation.state === 'exhausted') throw new UsageError('generation_exhausted', 409);
  if (operation.state === 'cancelled') throw new UsageError('operation_cancelled', 409);
  return { id, owner, operation };
}
