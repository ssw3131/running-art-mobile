// Only the explicitly approved, remaining synthetic account may enter Android QA.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

assert.ok(['phone', 'emulator'].includes(process.argv[2]));
const credentials = JSON.parse(await readFile(new URL('../../.cache/account-expansion/fixtures.private.json', import.meta.url), 'utf8'));
assert.equal(credentials.length, 1);
assert.match(credentials[0].email, /^runpen-photo-\d+-b@example\.invalid$/);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, 'zymfblgzpidgfjjgrino.supabase.co');
const client = createClient(url, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
});
const { data, error } = await client.auth.signInWithPassword(credentials[0]);
assert.equal(error, null, 'Disposable sign-in failed');
const verified = await client.auth.getUser();
assert.equal(verified.error, null, 'Server identity verification failed');
assert.equal(verified.data.user.id, data.session.user.id);
assert.equal(verified.data.user.email, credentials[0].email);
assert.ok(verified.data.user.identities.every(identity => identity.provider === 'email'));
await writeFile(new URL(`../../.cache/remaining-qa/session-${process.argv[2]}.private.json`, import.meta.url),
  JSON.stringify({ fixture: 'runpen-remaining-20261005', projectUrl: url, session: data.session }), { mode: 0o600 });
console.log('Server-verified disposable session prepared without printing credentials');
