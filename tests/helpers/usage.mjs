import { randomUUID } from 'node:crypto';
import { UsageError } from '../../supabase/functions/_shared/usage-backend.ts';
export const usageHeaders = () => ({ authorization: 'Bearer isolated-test', 'x-operation-id': randomUUID() });
// Explicit dependency injection for HTTP/worker tests. Never used by deployed code.
export function usageFixture() {
  const operations = new Map();
  return {
    operations,
    async authenticate(token) { if (token !== 'isolated-test') throw new UsageError('authentication_required', 401); return 'test-owner'; },
    async command(owner, action, args = {}) {
      let op = operations.get(args.id);
      if (action === 'reserve') {
        if (!op) { op = { id: args.id, owner, state: 'reserved', fingerprint: args.fingerprint }; operations.set(args.id, op); }
        if (op.fingerprint !== args.fingerprint) throw new UsageError('operation_mismatch', 409);
      } else if (action === 'ready' && op?.state === 'reserved') { op.state = 'ready'; op.result = args.result; }
      else if (action === 'commit' && ['ready', 'reserved'].includes(op?.state)) op.state = 'committed';
      else if (action === 'cancel' && op && op.state !== 'committed') op.state = 'cancelled';
      return op ? structuredClone(op) : null;
    },
  };
}
