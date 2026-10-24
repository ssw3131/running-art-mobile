import { UsageError, type UsageBackend } from '../_shared/usage-backend.ts';
export function createUsageHandler(backend: UsageBackend) {
  return async (request: Request) => {
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    try {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'invalid_request' }, 400);
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: 'invalid_request' }, 400);
      let raw = '', length = 0;
      const decoder = new TextDecoder();
      try { for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.length;
        if (length > 2048) { await reader.cancel(); return reply({ error: 'invalid_request' }, 400); }
        raw += decoder.decode(value, { stream: true });
      } } finally { reader.releaseLock(); }
      raw += decoder.decode();
      let body;
      try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid_request' }, 400); }
      if (!body || typeof body !== 'object' || !['status', 'reserve', 'read', 'commit', 'cancel', 'delete_course'].includes(body.action)) return reply({ error: 'invalid_request' }, 400);
      if (body.action === 'reserve' && (body.kind !== 'save' || !/^[a-f0-9]{64}$/.test(body.fingerprint))) return reply({ error: 'invalid_request' }, 400);
      if (!['status', 'delete_course'].includes(body.action) && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.id)) return reply({ error: 'invalid_request' }, 400);
      if ((body.action === 'delete_course' || body.courseId !== undefined) && !/^[a-f0-9]{32}$/.test(body.courseId)) return reply({ error: 'invalid_request' }, 400);
      const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
      const owner = await backend.authenticate(token);
      return reply(await backend.command(owner, body.action, { id: body.id, kind: body.kind, fingerprint: body.fingerprint, courseId: body.courseId }));
    } catch (error) {
      return reply({ error: error instanceof UsageError ? error.code : 'usage_unavailable' }, error instanceof UsageError ? error.status : 503);
    }
  };
}
