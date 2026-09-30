import { createRoadCache, migrateRoadCache, ROAD_CACHE_DATABASE } from './persistent-cache';
import type { RoadCache } from './persistent-cache';
import { mobileRoadCodecs } from './mobile-codecs';

let pending: Promise<RoadCache> | undefined;
export function getRoadCache(): Promise<RoadCache> {
  pending ??= (async () => {
    const SQLite = await import('expo-sqlite');
    const db = await SQLite.openDatabaseAsync(ROAD_CACHE_DATABASE);
    try { await migrateRoadCache(db); return createRoadCache(db, mobileRoadCodecs); }
    catch (error) { await db.closeAsync().catch(() => {}); throw error; }
  })().catch((error: unknown) => { pending = undefined; throw error; });
  return pending;
}
