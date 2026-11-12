/** Thumbnails show cartography only; provider credits remain on Service About.
 * Inline TileJSON prevents the native snapshotter from baking its attribution
 * into every small card. Original map/tile URLs and rendering limits are kept. */
export async function thumbnailStyle(style: Record<string, unknown>, request: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const sources = await Promise.all(Object.entries((style.sources ?? {}) as Record<string, Record<string, unknown>>).map(async ([id, source]) => {
    if (typeof source.url !== 'string' || !['vector','raster','raster-dem'].includes(String(source.type))) return [id, {...source,attribution:''}];
    if (!source.url.startsWith('https://')) throw new Error('Unsupported thumbnail tile source');
    const response = await request(source.url);
    if (!response.ok) throw new Error('Thumbnail tile metadata unavailable');
    const tileJSON = await response.json() as Record<string, unknown>;
    if (!Array.isArray(tileJSON.tiles) || !tileJSON.tiles.length || !tileJSON.tiles.every(tile => typeof tile === 'string')) throw new Error('Thumbnail tiles unavailable');
    const {url: _url, ...original} = source;
    const options = Object.fromEntries(['tiles','minzoom','maxzoom','bounds','scheme','tileSize','encoding'].filter(key => tileJSON[key] !== undefined).map(key => [key,tileJSON[key]]));
    return [id,{...options,...original,attribution:''}];
  }));
  return {...style,sources:Object.fromEntries(sources)};
}
