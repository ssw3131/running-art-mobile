import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import type { FeatureCollection, LineString } from 'geojson';
import type { RunPoint } from '@/modules/running/model';

const offlineStyle = { version: 8 as const, sources: {}, layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#E8EDE7' } }] };
const padding = { top: 30, bottom: 30, left: 30, right: 30 };
export default function RunPath({ points }: { points: RunPoint[] }) {
  const camera = useRef<CameraRef>(null);
  const drawing = useMemo(() => {
    const segments: RunPoint[][] = [];
    for (const point of points) {
      if (!segments.length || segments[segments.length - 1][0].segment !== point.segment) segments.push([]);
      segments[segments.length - 1].push(point);
    }
    const data: FeatureCollection<LineString> = { type: 'FeatureCollection', features: segments.filter(s => s.length > 1).map(segment => {
      // Keep segment endpoints while bounding rendering work. Stored coordinates remain complete.
      const stride = Math.max(1, Math.ceil(points.length / 2000));
      return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: segment.filter((_, i) => i === 0 || i === segment.length - 1 || i % stride === 0).map(p => [p.longitude, p.latitude]) } };
    }) };
    let west = 180, east = -180, south = 90, north = -90;
    for (const p of points) { west = Math.min(west, p.longitude); east = Math.max(east, p.longitude); south = Math.min(south, p.latitude); north = Math.max(north, p.latitude); }
    return { data, bounds: [west - 0.0002, south - 0.0002, east + 0.0002, north + 0.0002] as [number, number, number, number] };
  }, [points]);
  useEffect(() => { if (points.length) camera.current?.fitBounds(drawing.bounds, { padding, duration: 0 }); }, [drawing, points.length]);
  const last = points[points.length - 1];
  if (!last) return <View style={{ height: 180, backgroundColor: '#E8EDE7', padding: 24, justifyContent: 'center' }}><Text>GPS 위치를 받으면 이곳에 궤적을 표시해요.</Text></View>;
  return <View style={{ height: 260, borderRadius: 16, overflow: 'hidden' }}>
    <Map style={{ flex: 1 }} mapStyle={offlineStyle} attribution={false} logo={false}
      onDidFinishLoadingMap={() => camera.current?.fitBounds(drawing.bounds, { padding, duration: 0 })}>
      <Camera ref={camera} initialViewState={{ center: [last.longitude, last.latitude], zoom: 16 }} />
      <GeoJSONSource id="running-track" data={drawing.data}>
        <Layer id="running-line" type="line" paint={{ 'line-color': '#23694C', 'line-width': 4 }} />
      </GeoJSONSource>
      <GeoJSONSource id="running-position" data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [last.longitude, last.latitude] } }}>
        <Layer id="running-dot" type="circle" paint={{ 'circle-color': '#2563EB', 'circle-radius': 7, 'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF' }} />
      </GeoJSONSource>
    </Map>
  </View>;
}
