import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHandsetConfig } from '../scripts/ci/handset-config.mjs';
const config = () => ({
  EXPO_PUBLIC_MAPTILER_API_KEY: 'test-public-key',
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  EXPO_PUBLIC_COMPUTE_BASE_URL: 'https://example.com/api',
  EXPO_PUBLIC_ROAD_BASE_URL: 'https://example.com/roads',
  EXPO_PUBLIC_RUN_SHARE_URL: 'https://example.com/share',
});
test('handset configuration accepts complete public settings', () => assert.equal(validateHandsetConfig(config()), true));
test('missing settings and CI-local endpoints fail closed', () => {
  for (const key of Object.keys(config())) {
    const env = config(); delete env[key];
    assert.throws(() => validateHandsetConfig(env), /Missing/);
  }
  for (const url of ['http://example.com', 'https://localhost:54431', 'https://127.0.0.1', 'https://10.0.0.1', 'https://192.168.1.1']) {
    assert.throws(() => validateHandsetConfig({ ...config(), EXPO_PUBLIC_COMPUTE_BASE_URL: url }), /public HTTPS/);
  }
});
test('service-role and secret Supabase credentials cannot enter handset builds', () => {
  const jwt = role => 'x.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.x';
  for (const key of ['sb_secret_example', 'sb_publishable_isolated_ci', jwt('service_role')]) {
    assert.throws(() => validateHandsetConfig({ ...config(), EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }));
  }
  assert.equal(validateHandsetConfig({ ...config(), EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }), true);
});
