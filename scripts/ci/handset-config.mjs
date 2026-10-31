export function validateHandsetConfig(env) {
  for (const key of ['EXPO_PUBLIC_MAPTILER_API_KEY', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_COMPUTE_BASE_URL', 'EXPO_PUBLIC_ROAD_BASE_URL', 'EXPO_PUBLIC_RUN_SHARE_URL']) {
    if (!env[key]?.trim()) throw Error('Missing handset configuration: ' + key);
    if (key.endsWith('_URL')) {
      const url = new URL(env[key]);
      if (url.protocol !== 'https:' || /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[::1\]|\[f[cd]|\[fe[89ab])/.test(url.hostname)) throw Error('Handset configuration needs a public HTTPS endpoint: ' + key);
    }
  }
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (key.startsWith('sb_secret_') || key.includes('isolated_ci')) throw Error('Invalid public Supabase key');
  if (key.split('.').length === 3) {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    if (payload.role !== 'anon') throw Error('Only anon/publishable credentials may be bundled');
  } else if (!key.startsWith('sb_publishable_')) throw Error('Expected Supabase publishable key');
  return true;
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/handset-config.mjs')) {
  validateHandsetConfig(process.env);
  console.log('Handset public configuration validated; values omitted.');
}
