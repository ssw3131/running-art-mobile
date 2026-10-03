import * as ExpoCrypto from 'expo-crypto';

// supabase-js requires random values AND subtle.digest for S256 PKCE on Hermes.
// Fail closed for unsupported algorithms; never allow the SDK's Math.random/plain fallback.
const current = globalThis.crypto;
if (!current?.getRandomValues || !current?.subtle?.digest) {
  const replacement = {
    getRandomValues: ExpoCrypto.getRandomValues,
    randomUUID: ExpoCrypto.randomUUID,
    subtle: {
      digest: (algorithm: string | { name: string }, data: BufferSource) => {
        const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
        if (name.toUpperCase() !== 'SHA-256') throw new Error('Unsupported authentication digest');
        const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, bytes);
      },
    },
  };
  Object.defineProperty(globalThis, 'crypto', { value: replacement, configurable: true });
}
