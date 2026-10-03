export interface StringStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type Manifest = { generation: string; count: number };
const CHUNK_SIZE = 400; // Even UTF-8 Korean/emoji stays below the native 2 KiB limit.
const MAX_CHUNKS = 256;

function manifest(raw: string | null): Manifest | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as Manifest;
  if (!/^[a-zA-Z0-9-]+$/.test(value.generation) || !Number.isInteger(value.count) || value.count < 1 || value.count > MAX_CHUNKS) {
    throw new Error('Invalid secure session storage');
  }
  return value;
}

/** All values, including the manifest, live in encrypted native SecureStore.
 * Write new chunks before switching the manifest so interrupted refreshes preserve the old session.
 */
export function createSecureStorage(native: StringStorage, generation: () => string): StringStorage {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation);
    tail = result.catch(() => undefined);
    return result;
  };
  const part = (key: string, entry: Manifest, index: number) => `${key}.${entry.generation}.${index}`;
  const cleanup = async (key: string, entry: Manifest | null) => {
    if (entry) await Promise.all(Array.from({ length: entry.count }, (_, index) => native.removeItem(part(key, entry, index))));
  };
  return {
    getItem: key => serial(async () => {
      const entry = manifest(await native.getItem(key));
      if (!entry) return null;
      const chunks = await Promise.all(Array.from({ length: entry.count }, (_, i) => native.getItem(part(key, entry, i))));
      if (chunks.some(chunk => chunk === null)) throw new Error('Incomplete secure session storage');
      return chunks.join('');
    }),
    setItem: (key, value) => serial(async () => {
      const old = manifest(await native.getItem(key));
      // Split by code points to avoid splitting a surrogate pair across native writes.
      const chars = Array.from(value);
      const entry = { generation: generation(), count: Math.max(1, Math.ceil(chars.length / CHUNK_SIZE)) };
      if (entry.count > MAX_CHUNKS) throw new Error('Secure session too large');
      try {
        for (let i = 0; i < entry.count; i++) await native.setItem(part(key, entry, i), chars.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).join(''));
        await native.setItem(key, JSON.stringify(entry));
      } catch (error) {
        await cleanup(key, entry).catch(() => undefined);
        throw error;
      }
      // A failed cleanup must not report failure after the new session has committed.
      await cleanup(key, old).catch(() => undefined);
    }),
    removeItem: key => serial(async () => {
      const old = manifest(await native.getItem(key));
      await native.removeItem(key);
      await cleanup(key, old).catch(() => undefined);
    }),
  };
}
