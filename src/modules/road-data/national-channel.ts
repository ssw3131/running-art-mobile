import { createRoadHttp } from './channel.ts';
import type { RoadFetch } from './channel.ts';
import { validateManifest } from './file-format.ts';
import type { RoadCodecs } from './file-format.ts';
import type { RoadCacheRequest } from './persistent-cache.ts';
import { NATIONAL_PREFIX, NATIONAL_MAX_CATALOG, NATIONAL_MAX_MANIFEST,
  nationalRegions, validateNationalCatalog, validateNationalReference } from './national-format.ts';
import type { NationalReference } from './national-format.ts';

type Pointer = { format: 'running-art-national-channel'; schemaVersion: 1; release: string; catalog: NationalReference };
export function validateNationalPointer(value: unknown): asserts value is Pointer {
  const p = value as Partial<Pointer> | null;
  if (!p || p.format !== 'running-art-national-channel' || p.schemaVersion !== 1 ||
    typeof p.release !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(p.release)) throw invalid();
  validateNationalReference(p.catalog, NATIONAL_MAX_CATALOG);
}
function invalid() { return new Error('ROAD_FILE_NATIONAL_CHANNEL'); }

export function createNationalChannel(base: string, regionId: string, fetcher: RoadFetch, codecs: RoadCodecs,
  onRequest?: (url: string) => void): Required<Pick<RoadCacheRequest, 'downloadManifest' | 'downloadTile'>> {
  const expected = nationalRegions().find(r => r.id === regionId);
  if (!expected) throw invalid();
  const get = createRoadHttp(base, fetcher, onRequest);
  async function hashed(kind: 'catalogs' | 'manifests', reference: NationalReference, signal: AbortSignal) {
    const bytes = await get(`${NATIONAL_PREFIX}/${kind}/${reference.sha256}.json`, reference.bytes, 'application/json', signal, true);
    if (codecs.sha256(bytes) !== reference.sha256) throw invalid();
    return bytes;
  }
  return {
    async downloadManifest(signal) {
      const pointer: unknown = JSON.parse(codecs.utf8(await get(`${NATIONAL_PREFIX}/current.json`, 16384, 'application/json', signal)));
      validateNationalPointer(pointer);
      const catalog: unknown = JSON.parse(codecs.utf8(await hashed('catalogs', pointer.catalog, signal)));
      validateNationalCatalog(catalog);
      if (catalog.release !== pointer.release) throw invalid();
      const region = catalog.regions.find(r => r.id === regionId)!;
      validateNationalReference(region.manifest, NATIONAL_MAX_MANIFEST);
      const bytes = await hashed('manifests', region.manifest, signal);
      const manifest: unknown = JSON.parse(codecs.utf8(bytes));
      validateManifest(manifest);
      if (manifest.coverage !== 'national' || manifest.release !== catalog.release ||
        manifest.source.sha256 !== catalog.sourceSha256 ||
        JSON.stringify(manifest.coverageBounds) !== JSON.stringify(expected.coverageBounds)) throw invalid();
      return bytes;
    },
    downloadTile(manifest, file, signal) {
      validateManifest(manifest);
      if (manifest.coverage !== 'national' || JSON.stringify(manifest.coverageBounds) !== JSON.stringify(expected.coverageBounds) ||
        !manifest.files.some(f => f.id === file.id && f.sha256 === file.sha256 && f.bytes === file.bytes)) throw invalid();
      return get(`${NATIONAL_PREFIX}/tiles/${file.sha256}.json.gz`, file.bytes, 'application/gzip', signal, true);
    },
  };
}
