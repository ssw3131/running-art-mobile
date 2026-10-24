import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

export function validateIsolatedStatus(env) {
  const url = new URL(env.API_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol === 'http:' && url.port === '54321'
    && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'Only the runpen-ci loopback API on port 54321 is permitted');
  assert.ok(env.ANON_KEY && env.SERVICE_ROLE_KEY, 'Missing local Supabase keys');
  return url;
}

export function isolatedSupabase(statusPath = process.env.QA_SUPABASE_STATUS ?? '.cache/qa-supabase-status.json') {
  const env = JSON.parse(readFileSync(statusPath, 'utf8').replace(/^\uFEFF/, ''));
  const url = validateIsolatedStatus(env);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return { env, url, admin: createClient(url.href, env.SERVICE_ROLE_KEY, options), client: () => createClient(url.href, env.ANON_KEY, options) };
}
