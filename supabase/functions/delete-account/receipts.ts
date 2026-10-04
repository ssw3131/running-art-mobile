// A short-lived status capability, not an Auth token or proof of deletion.
// The server keeps no receipt rows after account deletion.
export interface DeletionReceipts {
  issue(owner: string): Promise<{ receipt: string; expiresAt: number }>;
  read(receipt: string): Promise<{ owner: string } | null>;
}
export function isAccountId(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
}
const lifetime = 24 * 60 * 60;
const purpose = 'runpen-account-deletion-status-v1';
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), character => character.charCodeAt(0));
  if (encode(bytes) !== value) throw new Error('Noncanonical encoding');
  return bytes;
}
export function createDeletionReceipts(secret: string, audience: string, now = Date.now): DeletionReceipts {
  if (secret.length !== 64 || !/^[a-f0-9]{64}$/i.test(secret) || !audience) throw new Error('Receipt configuration unavailable');
  const key = crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g)!, pair => parseInt(pair, 16)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const encoder = new TextEncoder();
  return {
    async issue(owner) {
      if (!isAccountId(owner)) throw new Error('Invalid owner');
      const issuedAt = Math.floor(now() / 1000), expiresAt = issuedAt + lifetime;
      const body = encode(encoder.encode(JSON.stringify({ purpose, audience, owner, issuedAt, expiresAt, nonce: crypto.randomUUID() })));
      const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await key, encoder.encode(body)));
      return { receipt: `${body}.${encode(signature)}`, expiresAt };
    },
    async read(receipt) {
      try {
        if (typeof receipt !== 'string' || receipt.length > 1500) return null;
        const parts = receipt.split('.');
        if (parts.length !== 2) return null;
        const [body, signature] = parts;
        const signatureBytes = decode(signature);
        if (signatureBytes.length !== 32 || !await crypto.subtle.verify('HMAC', await key, signatureBytes, encoder.encode(body))) return null;
        const claim = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(body)));
        const seconds = Math.floor(now() / 1000);
        if (!claim || claim.purpose !== purpose || claim.audience !== audience || !isAccountId(claim.owner) || !isAccountId(claim.nonce) ||
            !Number.isSafeInteger(claim.issuedAt) || !Number.isSafeInteger(claim.expiresAt) || claim.expiresAt - claim.issuedAt !== lifetime ||
            claim.issuedAt > seconds || claim.expiresAt <= seconds) return null;
        return { owner: claim.owner };
      } catch { return null; }
    },
  };
}
