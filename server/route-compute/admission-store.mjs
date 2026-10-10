const ROOT = 'https://storage.googleapis.com';
const METADATA = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

// Cloud Run's attached identity; no service account key or user token is bundled.
export function createMetadataTokenProvider(fetcher = fetch, now = Date.now) {
  let cached;
  return async signal => {
    if (cached && cached.until > now()) return cached.token;
    const response = await fetcher(METADATA, { headers: { 'Metadata-Flavor': 'Google' },
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) });
    if (!response.ok || response.headers.get('metadata-flavor') !== 'Google') throw new Error('metadata_unavailable');
    const value = await response.json();
    if (typeof value.access_token !== 'string' || !Number.isFinite(value.expires_in) || value.expires_in < 60) throw new Error('metadata_invalid');
    cached = { token: value.access_token, until: now() + (value.expires_in - 60) * 1000 };
    return cached.token;
  };
}

export function createGcsAdmissionStore({ bucket, object = 'admission-v1.json', token = createMetadataTokenProvider(), fetcher = fetch }) {
  if (!/^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/.test(bucket ?? '') || !/^[a-zA-Z0-9/_-]+\.json$/.test(object)) throw new Error('invalid_guard_storage');
  const resource = `${ROOT}/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}`;
  const request = async (url, init, signal) => {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
    return fetcher(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${await token(bounded)}` },
      redirect: 'error', signal: bounded });
  };
  return {
    async read(signal) {
      // Metadata and body are pinned to the same immutable generation. A body
      // from a newer write must never be paired with an older CAS precondition.
      const metaResponse = await request(`${resource}?fields=generation`, {}, signal);
      if (!metaResponse.ok) throw new Error('guard_read_failed');
      const { generation } = await metaResponse.json();
      if (typeof generation !== 'string' || !/^\d+$/.test(generation)) throw new Error('guard_generation_invalid');
      const response = await request(`${resource}?alt=media&ifGenerationMatch=${generation}`, {}, signal);
      if (response.status === 412) {
        await response.body?.cancel();
        const error = new Error('guard_read_changed'); error.code = 'guard_read_changed'; throw error;
      }
      if (!response.ok) throw new Error('guard_body_failed');
      const body = await response.text();
      if (body.length > 4096) throw new Error('guard_body_size');
      return { generation, state: JSON.parse(body) };
    },
    async compareAndSwap(generation, state, signal) {
      if (!/^\d+$/.test(generation)) throw new Error('guard_generation_invalid');
      const url = `${ROOT}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(object)}&ifGenerationMatch=${generation}`;
      const response = await request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) }, signal);
      if (response.status === 412) { await response.body?.cancel(); return false; }
      if (!response.ok) throw new Error('guard_write_failed');
      await response.body?.cancel();
      return true;
    },
  };
}
