// Read-only anonymous checks. Never publishes, reads, or modifies a real route.
import assert from 'node:assert/strict';
import { authConfig } from '../../src/modules/auth/config.ts';
const config = authConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
if (!config) throw new Error('Public Supabase configuration required');
const headers = { apikey: config.key, 'Content-Type': 'application/json' };
const request = (path, init = {}) => fetch(`${config.url}/rest/v1/${path}`, { ...init, headers, signal: AbortSignal.timeout(20000), redirect: 'error' });
const missing = await request('rpc/read_run_share', { method: 'POST', body: JSON.stringify({ p_token: 'invalid' }) });
assert.equal(missing.status, 200); assert.equal(await missing.json(), null);
for (const table of ['run_shares', 'personal_records']) {
  const result = await request(`${table}?select=*&limit=1`);
  assert.ok([401, 403].includes(result.status), `${table} must deny anonymous enumeration`);
}
const revoke = await request('rpc/revoke_run_share', { method: 'POST', body: JSON.stringify({ p_run_id: '0'.repeat(32) }) });
assert.ok([401, 403].includes(revoke.status));
console.log('PASS: hosted anonymous invalid-link lookup; private/share enumeration and anonymous revoke denied');
