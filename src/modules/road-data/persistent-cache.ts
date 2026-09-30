import type { StorageDatabase, SqlExecutor } from '../storage/types.ts';
import { decodeRoadTile, mergeRoadTiles, selectRoadFiles, validateManifest } from './file-format.ts';
import type { Bounds, RoadCodecs, RoadFile, RoadManifest, RoadTile, RoadWay } from './file-format.ts';

export const ROAD_CACHE_DATABASE = 'running-art-road-cache.db';
export const ROAD_CACHE_MAX_BYTES = 64 * 1024 * 1024;
export const ROAD_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MANIFEST = 2 * 1024 * 1024;
const MAX_WORKING_DECODED = 64 * 1024 * 1024;

export class RoadCacheError extends Error {
  readonly code: 'cancelled' | 'missing' | 'corrupt' | 'capacity' | 'storage' | 'newer-schema';
  constructor(code: RoadCacheError['code'], message: string) { super(message); this.name = 'RoadCacheError'; this.code = code; }
}
export function checkRoadCacheSignal(signal: AbortSignal) {
  if (signal.aborted) throw new RoadCacheError('cancelled', '도로 캐시 작업을 취소했어요.');
}
type Dataset = { source: string; hash: string; manifest: Uint8Array; checked_at: number };
export type RoadCacheRequest = {
  source: string; bounds: Bounds; signal: AbortSignal; mode: 'offline' | 'prefer-cache' | 'refresh';
  downloadManifest?: (signal: AbortSignal) => Promise<Uint8Array>;
  downloadTile?: (manifest: RoadManifest, file: RoadFile, signal: AbortSignal) => Promise<Uint8Array>;
  yieldToHost?: () => Promise<void>;
};
export type RoadCacheResult = {
  elements: RoadWay[]; release: string; manifestHash: string; files: number; reused: number; downloaded: number;
  stale: boolean; updateFailed: boolean; checkedAt: number;
};

export async function migrateRoadCache(db: StorageDatabase) {
  await db.execAsync('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  await db.withExclusiveTransactionAsync(async tx => {
    const version = await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if (!version || !Number.isSafeInteger(version.user_version) || version.user_version < 0) throw new Error('Invalid cache schema');
    if (version.user_version > 1) throw new RoadCacheError('newer-schema', '더 최신 앱에서 만든 도로 캐시예요. 앱을 업데이트해 주세요.');
    if (version.user_version === 0) await tx.execAsync(`
      CREATE TABLE road_cache_datasets (
        source TEXT NOT NULL, hash TEXT NOT NULL, manifest BLOB NOT NULL,
        checked_at INTEGER NOT NULL, used_at INTEGER NOT NULL, PRIMARY KEY(source, hash)
      );
      CREATE TABLE road_cache_tiles (
        source TEXT NOT NULL, hash TEXT NOT NULL, cell TEXT NOT NULL, payload BLOB NOT NULL,
        used_at INTEGER NOT NULL, PRIMARY KEY(source, hash, cell)
      );
      CREATE TABLE road_cache_current (source TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL);
      CREATE INDEX road_cache_lru ON road_cache_tiles(used_at);
      PRAGMA user_version=1;`);
  });
}

export function createRoadCache(db: StorageDatabase, codecs: RoadCodecs, options: {
  now?: () => number; maxBytes?: number; maxAgeMs?: number;
} = {}) {
  const now = options.now ?? Date.now, maxBytes = options.maxBytes ?? ROAD_CACHE_MAX_BYTES;
  const maxAgeMs = options.maxAgeMs ?? ROAD_CACHE_MAX_AGE_MS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) throw new Error('Invalid cache limits');
  // One queue owns this dedicated database. A load keeps its files protected until
  // it returns independent in-memory engine input; clear/prune/close wait for it.
  let tail: Promise<unknown> = Promise.resolve(), closed = false;
  function queue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(async () => {
      if (closed) throw new RoadCacheError('storage', '도로 캐시 연결이 닫혔어요.');
      return task();
    });
    tail = result.catch(() => {});
    return result;
  }
  function parseManifest(bytes: Uint8Array, hash?: string): RoadManifest {
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_MANIFEST || (hash && codecs.sha256(bytes) !== hash)) {
      throw new RoadCacheError('corrupt', '저장된 도로 목록이 손상됐어요. 다시 받아 주세요.');
    }
    const manifest: unknown = JSON.parse(codecs.utf8(bytes));
    validateManifest(manifest);
    return manifest;
  }
  async function totalBytes(tx: SqlExecutor) {
    const row = await tx.getFirstAsync<{ bytes: number }>(`SELECT
      COALESCE((SELECT SUM(length(manifest)) FROM road_cache_datasets),0) +
      COALESCE((SELECT SUM(length(payload)) FROM road_cache_tiles),0) AS bytes`);
    return row?.bytes ?? 0;
  }
  async function prune(tx: SqlExecutor, source: string, hash: string, protectedCells: Set<string>) {
    let bytes = await totalBytes(tx);
    if (bytes <= maxBytes) return;
    const rows = await tx.getAllAsync<{ source: string; hash: string; cell: string; bytes: number }>(
      'SELECT source,hash,cell,length(payload) AS bytes FROM road_cache_tiles ORDER BY used_at,source,hash,cell');
    for (const row of rows) {
      if (bytes <= maxBytes) break;
      if (row.source === source && row.hash === hash && protectedCells.has(row.cell)) continue;
      await tx.runAsync('DELETE FROM road_cache_tiles WHERE source=? AND hash=? AND cell=?', row.source, row.hash, row.cell);
      bytes -= row.bytes;
    }
    // Empty old manifests can otherwise accumulate indefinitely across releases.
    const empty = await tx.getAllAsync<{ source: string; hash: string; bytes: number }>(`SELECT d.source,d.hash,length(d.manifest) AS bytes
      FROM road_cache_datasets d WHERE NOT EXISTS (SELECT 1 FROM road_cache_tiles t WHERE t.source=d.source AND t.hash=d.hash)
      ORDER BY d.used_at,d.source,d.hash`);
    for (const row of empty) {
      if (row.source === source && row.hash === hash) continue;
      await tx.runAsync('DELETE FROM road_cache_current WHERE source=? AND hash=?', row.source, row.hash);
      await tx.runAsync('DELETE FROM road_cache_datasets WHERE source=? AND hash=?', row.source, row.hash);
      bytes -= row.bytes;
    }
    if (bytes > maxBytes) throw new RoadCacheError('capacity', '이 지역의 도로 자료가 캐시 용량 한도를 넘어요. 탐색 범위를 줄여 주세요.');
  }
  async function materialize(request: RoadCacheRequest, bytes: Uint8Array, checkedAt: number, allowDownload: boolean): Promise<RoadCacheResult> {
    const { source, signal } = request;
    checkRoadCacheSignal(signal);
    // Copy caller-owned buffers before async operations to pin this exact version.
    const manifestBytes = new Uint8Array(bytes), manifest = parseManifest(manifestBytes), hash = codecs.sha256(manifestBytes);
    const files = selectRoadFiles(manifest, request.bounds);
    if (files.reduce((n, file) => n + file.decodedBytes, 0) > MAX_WORKING_DECODED ||
      files.reduce((n, file) => n + file.bytes, manifestBytes.length) > maxBytes) {
      throw new RoadCacheError('capacity', '한 번에 읽을 수 있는 도로 자료 크기를 넘어요. 탐색 범위를 줄여 주세요.');
    }
    const tiles: RoadTile[] = [], downloaded: { file: RoadFile; bytes: Uint8Array }[] = [];
    let reused = 0;
    for (const file of files) {
      checkRoadCacheSignal(signal);
      const row = await db.getFirstAsync<{ payload: Uint8Array }>('SELECT payload FROM road_cache_tiles WHERE source=? AND hash=? AND cell=?', source, hash, file.id);
      let tile: RoadTile | undefined;
      if (row) {
        try { tile = decodeRoadTile(row.payload, manifest, file, codecs); reused++; }
        catch { /* A corrupt entry is never used. Replacement is committed only with the full query. */ }
      }
      if (!tile) {
        if (!allowDownload || !request.downloadTile) throw new RoadCacheError(row ? 'corrupt' : 'missing', row
          ? '저장된 도로 파일이 손상됐어요. 연결 후 다시 받아 주세요.' : '이 지역의 저장된 도로가 부족해요. 먼저 자료를 받아 주세요.');
        const payload = new Uint8Array(await request.downloadTile(manifest, file, signal));
        checkRoadCacheSignal(signal);
        tile = decodeRoadTile(payload, manifest, file, codecs);
        downloaded.push({ file, bytes: payload });
      }
      tiles.push(tile);
      await request.yieldToHost?.();
      checkRoadCacheSignal(signal);
    }
    const elements = mergeRoadTiles(manifest, tiles, request.bounds);
    checkRoadCacheSignal(signal);
    const usedAt = now();
    try {
      await db.withExclusiveTransactionAsync(async tx => {
        checkRoadCacheSignal(signal);
        await tx.runAsync(`INSERT INTO road_cache_datasets(source,hash,manifest,checked_at,used_at) VALUES(?,?,?,?,?)
          ON CONFLICT(source,hash) DO UPDATE SET manifest=excluded.manifest,checked_at=excluded.checked_at,used_at=excluded.used_at`,
        source, hash, manifestBytes, checkedAt, usedAt);
        for (const item of downloaded) {
          await tx.runAsync(`INSERT INTO road_cache_tiles(source,hash,cell,payload,used_at) VALUES(?,?,?,?,?)
            ON CONFLICT(source,hash,cell) DO UPDATE SET payload=excluded.payload,used_at=excluded.used_at`, source, hash, item.file.id, item.bytes, usedAt);
          checkRoadCacheSignal(signal);
        }
        for (const file of files) await tx.runAsync('UPDATE road_cache_tiles SET used_at=? WHERE source=? AND hash=? AND cell=?', usedAt, source, hash, file.id);
        await prune(tx, source, hash, new Set(files.map(file => file.id)));
        await tx.runAsync('INSERT INTO road_cache_current(source,hash) VALUES(?,?) ON CONFLICT(source) DO UPDATE SET hash=excluded.hash', source, hash);
        // Cancellation before this commit barrier rolls the transaction back.
        checkRoadCacheSignal(signal);
      });
    } catch (error) {
      if (error instanceof RoadCacheError) throw error;
      throw new RoadCacheError('storage', '도로 자료를 저장하지 못했어요. 저장 공간을 확인해 주세요. 이전 저장 자료는 유지돼요.');
    }
    checkRoadCacheSignal(signal);
    return { elements, release: manifest.release, manifestHash: hash, files: files.length, reused, downloaded: downloaded.length,
      stale: usedAt - checkedAt >= maxAgeMs || usedAt < checkedAt, updateFailed: false, checkedAt };
  }
  return {
    load(request: RoadCacheRequest): Promise<RoadCacheResult> {
      return queue(async () => {
        checkRoadCacheSignal(request.signal);
        if (typeof request.source !== 'string' || !request.source.trim() || request.source.length > 512) throw new Error('Invalid road cache source');
        if (!['offline', 'prefer-cache', 'refresh'].includes(request.mode)) throw new Error('Invalid road cache mode');
        const saved = await db.getFirstAsync<Dataset>(`SELECT d.* FROM road_cache_datasets d JOIN road_cache_current c
          ON c.source=d.source AND c.hash=d.hash WHERE d.source=?`, request.source);
        let validSaved = false;
        if (saved) { try { parseManifest(saved.manifest, saved.hash); validSaved = true; } catch {} }
        const age = saved ? now() - saved.checked_at : Infinity;
        const fresh = validSaved && age >= 0 && age < maxAgeMs;
        if (request.mode === 'offline') {
          if (!validSaved || !saved) throw new RoadCacheError(saved ? 'corrupt' : 'missing', '사용할 수 있는 저장 도로 목록이 없어요. 먼저 자료를 받아 주세요.');
          return materialize(request, saved.manifest, saved.checked_at, false);
        }
        if (request.mode === 'prefer-cache' && fresh && saved) return materialize(request, saved.manifest, saved.checked_at, true);
        try {
          if (!request.downloadManifest) throw new RoadCacheError('missing', '도로 공급 연결이 준비되지 않았어요.');
          const manifestBytes = await request.downloadManifest(request.signal);
          checkRoadCacheSignal(request.signal);
          return await materialize(request, manifestBytes, now(), true);
        } catch (error) {
          checkRoadCacheSignal(request.signal);
          if (request.mode !== 'prefer-cache' || !validSaved || !saved ||
            (error instanceof RoadCacheError && ['storage', 'capacity'].includes(error.code))) throw error;
          // Expired data is usable only if the entire saved query still verifies.
          const fallback = await materialize(request, saved.manifest, saved.checked_at, false);
          return { ...fallback, updateFailed: true };
        }
      });
    },
    status() { return queue(async () => ({ bytes: await totalBytes(db), maxBytes,
      datasets: (await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM road_cache_datasets'))?.count ?? 0,
      files: (await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM road_cache_tiles'))?.count ?? 0 })); },
    clear() { return queue(async () => {
      await db.withExclusiveTransactionAsync(tx => tx.execAsync('DELETE FROM road_cache_current; DELETE FROM road_cache_tiles; DELETE FROM road_cache_datasets;'));
    }); },
    close() { return queue(async () => { await db.closeAsync(); closed = true; }); },
  };
}
export type RoadCache = ReturnType<typeof createRoadCache>;
