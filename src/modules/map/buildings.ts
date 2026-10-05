import type { MapRef } from '@maplibre/maplibre-react-native';

// Streets v2: Building (fill, including its outline) and Building 3D
// (fill-extrusion) both use this source-layer. Road/POI/label sources stay visible.
export async function hideMapBuildings(map: MapRef | null): Promise<void> {
  if (map) await map.setSourceVisibility(false, 'maptiler_planet', 'building');
}
