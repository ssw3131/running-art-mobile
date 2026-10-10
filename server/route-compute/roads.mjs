import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createRoadCache, migrateRoadCache } from '../../src/modules/road-data/persistent-cache.ts';
import { createNationalChannel } from '../../src/modules/road-data/national-channel.ts';
import { NATIONAL_PREFIX, nationalRegionId } from '../../src/modules/road-data/national-format.ts';
import { DEFAULT_ROAD_BASE_URL, roadBaseUrl } from '../../src/modules/road-data/channel.ts';
import { roadBounds } from '../../src/modules/road-data/bounds.ts';

const codecs = { sha256: bytes => createHash('sha256').update(bytes).digest('hex'),
  gunzip: (bytes, maxOutputLength) => gunzipSync(bytes, { maxOutputLength }),
  utf8: bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes) };

// Only public compressed road tiles are cached. No user requests/results persist.
export async function createServerRoads(baseUrl = DEFAULT_ROAD_BASE_URL, fetcher = fetch) {
  const root = roadBaseUrl(baseUrl), sqlite = new DatabaseSync(':memory:');
  const executor = {
    async execAsync(sql) { sqlite.exec(sql); },
    async runAsync(sql, ...params) { const r = sqlite.prepare(sql).run(...params); return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) }; },
    async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params) ?? null; },
    async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params); },
  };
  const db = { ...executor, async withExclusiveTransactionAsync(fn) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { await fn(executor); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  await migrateRoadCache(db);
  const cache = createRoadCache(db, codecs, { maxAgeMs: 60 * 60 * 1000 });
  return async (request, signal) => {
    const region = nationalRegionId(request.origin);
    return cache.load({ source: `${root}/${NATIONAL_PREFIX}/current.json#${region}`,
      bounds: roadBounds(request.origin, request.options.radiusKm * 1000), signal,
      mode: request.refresh ? 'refresh' : 'prefer-cache',
      ...createNationalChannel(root, region, fetcher, codecs) });
  };
}
