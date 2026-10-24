import assert from 'node:assert/strict';
import test from 'node:test';
import { validateIsolatedStatus } from '../scripts/qa/isolated-supabase.mjs';

test('Android membership fixture rejects hosted, non-loopback and ambiguous backend URLs before any request', () => {
  const status = { API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'test-public', SERVICE_ROLE_KEY: 'test-admin' };
  assert.equal(validateIsolatedStatus(status).origin, status.API_URL);
  for (const API_URL of ['https://project.supabase.co', 'http://10.0.2.2:54321', 'http://127.0.0.1:54322', 'http://localhost:54321/admin', 'http://user@localhost:54321', 'http://localhost:54321?host=remote']) {
    assert.throws(() => validateIsolatedStatus({ ...status, API_URL }));
  }
  assert.throws(() => validateIsolatedStatus({ ...status, SERVICE_ROLE_KEY: '' }));
});
