import { createUsageBackend } from '../_shared/usage-backend.ts';
import { createUsageHandler } from './handler.ts';
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
const backend = createUsageBackend({ url: Deno.env.get('SUPABASE_URL') ?? '', serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', identityKey: Deno.env.get('USAGE_IDENTITY_HMAC_KEY') ?? '' });
Deno.serve(createUsageHandler(backend));
