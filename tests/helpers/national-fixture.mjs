import { gzipSync } from 'node:zlib';
import { nationalRegions, NATIONAL_PREFIX } from '../../src/modules/road-data/national-format.ts';
import { cellBounds, wayIntersectsBounds } from '../../src/modules/road-data/file-format.ts';
import { sha256 } from '../../scripts/road-data/common.mjs';

export function nationalFixture(release = 'test-a') {
  const source = { sha256: 'a'.repeat(64), url: 'https://example.com/synthetic-test.pbf',
    dataTimestamp: '2026-09-29T20:22:51Z', license: 'ODbL-1.0', attribution: 'synthetic fixture' };
  const way = { type: 'way', id: 100, nodes: [1,2], tags: { highway: 'footway' },
    geometry: [{ lat: 37.499, lon: 126.999 }, { lat: 37.501, lon: 127.001 }] };
  const files = [], local = new Map(), objects = new Map();
  const add = (key, body, type = 'application/json; charset=utf-8') => objects.set(key, { body,
    sha256: sha256(body), contentType: type, cacheControl: 'public, max-age=31536000, immutable, no-transform' });
  for (let row = 1874; row <= 1875; row++) for (let col = 6349; col <= 6350; col++) {
    const bounds = cellBounds(row,col,200000), id = `${row}_${col}`;
    if (!wayIntersectsBounds(way,bounds)) continue;
    const decoded = Buffer.from(JSON.stringify({ format: 'running-art-road-tile', schemaVersion: 1,
      release, id, bounds, coordinateOrder: 'lat,lon', elements: [way] }));
    const body = gzipSync(decoded), relative = `tiles/${id}.json.gz`;
    const file = { id, bounds, path: relative, encoding: 'gzip', bytes: body.length, sha256: sha256(body),
      decodedBytes: decoded.length, decodedSha256: sha256(decoded), ways: 1 };
    files.push(file); local.set(relative,body); add(`${NATIONAL_PREFIX}/tiles/${file.sha256}.json.gz`,body,'application/gzip');
  }
  const byId = new Map(files.map(f => [f.id,f]));
  const regions = nationalRegions().map(region => {
    const present = [], emptyCells = [], b = region.coverageBounds;
    for (let r = Math.round(b[0]*50); r < Math.round(b[2]*50); r++) for (let c = Math.round(b[1]*50); c < Math.round(b[3]*50); c++) {
      const id = `${r}_${c}`;
      if (byId.has(id)) present.push(byId.get(id)); else emptyCells.push(id);
    }
    const manifest = { format: 'running-art-road-manifest', schemaVersion:1, release, coverage:'national',
      coverageBounds: b, coordinateOrder:'lat,lon',gridStepE7:200000,source,files:present,emptyCells };
    const body = Buffer.from(JSON.stringify(manifest)), hash = sha256(body), relative = `manifests/${hash}.json`;
    local.set(relative,body); add(`${NATIONAL_PREFIX}/${relative}`,body);
    return { ...region, manifest:{bytes:body.length,sha256:hash} };
  });
  const catalog = {format:'running-art-national-catalog',schemaVersion:1,release,sourceSha256:source.sha256,regions};
  const catalogBody = Buffer.from(JSON.stringify(catalog));
  local.set('catalog.json',catalogBody); add(`${NATIONAL_PREFIX}/catalogs/${sha256(catalogBody)}.json`,catalogBody);
  const pointer = {format:'running-art-national-channel',schemaVersion:1,release,catalog:{bytes:catalogBody.length,sha256:sha256(catalogBody)}};
  objects.set(`${NATIONAL_PREFIX}/current.json`,{body:Buffer.from(JSON.stringify(pointer)),contentType:'application/json',cacheControl:'no-store, no-transform'});
  local.set('inventory.json',Buffer.from(JSON.stringify({format:'running-art-national-inventory',schemaVersion:1,release,
    gridStepE7:200000,source,extractionSha256:'b'.repeat(64),files})));
  return { objects, local, catalog, pointer, files, way };
}
