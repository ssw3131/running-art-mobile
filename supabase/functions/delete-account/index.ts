import { createClient } from '@supabase/supabase-js';
import { createDeletionBackend } from './backend.ts';
import { createDeletionHandler } from './handler.ts';
import { createDeletionReceipts } from './receipts.ts';

// Minimal runtime surface also checked by the repository's server typecheck.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

Deno.serve(async request => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const receiptKey = Deno.env.get('ACCOUNT_DELETION_RECEIPT_KEY');
  // Deployment is deliberately fail-closed until SQL, disposable-account checks
  // and the app's explicit confirmation/local-data policy have been validated.
  if (Deno.env.get('ACCOUNT_DELETION_ENABLED') !== 'true' || !url || !key || !receiptKey || receiptKey.length !== 64 || !/^[a-f0-9]{64}$/i.test(receiptKey)) {
    return Response.json({ state: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const deadline = AbortSignal.timeout(45_000);
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, {
      ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
    }) },
  });
  return createDeletionHandler(createDeletionBackend(admin), createDeletionReceipts(receiptKey, url))(request);
});
