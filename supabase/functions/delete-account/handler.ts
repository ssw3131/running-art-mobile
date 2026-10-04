// Server only. The adapter must authenticate against Auth and use admin credentials
// only for the verified subject. Never take an owner ID or storage path from input.
import { isAccountId, type DeletionReceipts } from './receipts.ts';

export interface DeletionBackend {
  user(token: string): Promise<{ id: string; anonymous: boolean } | null>;
  accountExists(owner: string): Promise<boolean>;
  begin(owner: string): Promise<void>;
  files(owner: string): Promise<string[]>;
  remove(paths: string[]): Promise<void>;
  deleteUser(owner: string): Promise<void>;
}

const payload = /^(course|run)\/[a-f0-9]{32}\/[a-f0-9]{64}\.json$/;
const reply = (status: number, state: string, extra?: { receipt: string; expiresAt: number }) => Response.json({ state, ...extra }, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

type DeletionRequest = { action: 'prepare' } | { action: 'status'; receipt: string } | { action: 'delete'; confirmation: 'delete-my-account'; receipt: string };
async function parseRequest(request: Request): Promise<DeletionRequest | null> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !request.body) return null;
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2048) { await reader.cancel(); return null; }
      parts.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (typeof body !== 'object' || !body || !('action' in body)) return null;
    const count = Object.keys(body).length;
    if (body.action === 'prepare' && count === 1) return { action: 'prepare' };
    if (!('receipt' in body) || typeof body.receipt !== 'string' || body.receipt.length > 1500) return null;
    if (body.action === 'status' && count === 2) return { action: 'status', receipt: body.receipt };
    if (body.action === 'delete' && count === 3 && 'confirmation' in body && body.confirmation === 'delete-my-account') {
      return { action: 'delete', confirmation: 'delete-my-account', receipt: body.receipt };
    }
    return null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export function createDeletionHandler(backend: DeletionBackend, receipts: DeletionReceipts) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply(405, 'method_not_allowed');
    const body = await parseRequest(request);
    if (!body) return reply(400, 'invalid_request');
    // A receipt permits status lookup only. Preparation and EVERY destructive
    // continuation still require a live Auth bearer and an explicit confirmation.
    const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
    if (body.action !== 'status' && !token) return reply(401, 'authentication_required');
    try {
      if (body.action === 'status') {
        const claim = await receipts.read(body.receipt);
        if (!claim) return reply(401, 'receipt_invalid');
        return reply(200, await backend.accountExists(claim.owner) ? 'not_deleted' : 'deleted');
      }
      const user = await backend.user(token!);
      if (!user || user.anonymous || !isAccountId(user.id)) return reply(401, 'authentication_required');
      if (body.action === 'prepare') return reply(200, 'prepared', await receipts.issue(user.id));
      const claim = await receipts.read(body.receipt);
      if (!claim || claim.owner !== user.id) return reply(403, 'receipt_invalid');
      await backend.begin(user.id);
      // Always read the first remaining batch. Offsets would skip files as removals
      // shrink the listing. Return 202 for large accounts; a retry resumes the job.
      for (let batch = 0; batch < 5; batch++) {
        const paths = await backend.files(user.id);
        if (!Array.isArray(paths) || paths.length > 100 || new Set(paths).size !== paths.length || paths.some(path =>
          typeof path !== 'string' || !path.startsWith(`${user.id}/`) || !payload.test(path.slice(user.id.length + 1)))) {
          throw new Error('Invalid server storage listing');
        }
        if (!paths.length) {
          await backend.deleteUser(user.id);
          return reply(200, 'deleted');
        }
        await backend.remove(paths);
      }
      return reply(202, 'deleting');
    } catch {
      // Includes lost responses: never report success or clear the device on an
      // unconfirmed deletion. Raw SDK errors, tokens and paths are not returned.
      return reply(503, 'retry_required');
    }
  };
}
