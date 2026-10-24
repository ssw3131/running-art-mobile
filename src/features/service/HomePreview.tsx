import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/ui';
import { homePathSvg, type HomePath } from '@/modules/home/model';
import { mapStyleUrl, themedMapStyle } from '@/modules/map/config';
import { useThemeColors } from '@/theme/ThemeProvider';

const baseStyle = mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY);

function PreviewMap({ paths, styleUrl, onFailure }: { paths: HomePath[]; styleUrl: string; onFailure(): void }) {
  const camera = useRef<CameraRef>(null), [loaded, setLoaded] = useState(false);
  const geometry = useMemo(() => {
    const points = paths.flat();
    const bounds = points.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [180, 85, -180, -85]);
    if (bounds[0] === bounds[2]) { bounds[0] -= .0001; bounds[2] += .0001; }
    if (bounds[1] === bounds[3]) { bounds[1] -= .0001; bounds[3] += .0001; }
    return { bounds: bounds as [number, number, number, number], first: points[0],
      data: { type: 'FeatureCollection' as const, features: paths.filter(p => p.length > 1).map(p => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: p } })) } };
  }, [paths]);
  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(onFailure, 12000);
    return () => clearTimeout(timer);
  }, [loaded, onFailure]);
  useEffect(() => {
    if (loaded) camera.current?.fitBounds(geometry.bounds, { padding: { top: 16, bottom: 16, left: 16, right: 16 }, duration: 0 });
  }, [loaded, geometry.bounds]);
  return <Map testID="home-preview-map" style={StyleSheet.absoluteFill} mapStyle={styleUrl} logo={false} attribution={false} compass={false}
    dragPan={false} touchZoom={false} touchRotate={false} touchPitch={false} doubleTapZoom={false} doubleTapHoldZoom={false}
    preferredFramesPerSecond={15} onDidFinishLoadingMap={() => setLoaded(true)} onDidFailLoadingMap={onFailure}>
    <Camera ref={camera} initialViewState={{ bounds: geometry.bounds, padding: { top: 16, bottom: 16, left: 16, right: 16 } }} />
    <GeoJSONSource id="home-trace" data={geometry.data}>
      <Layer id="home-trace-border" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 5 }} />
      <Layer id="home-trace-line" type="line" paint={{ 'line-color': '#FF5264', 'line-width': 3 }} />
    </GeoJSONSource>
    <GeoJSONSource id="home-start" data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: geometry.first } }}>
      <Layer id="home-start-dot" type="circle" paint={{ 'circle-radius': 4, 'circle-color': '#5197FE', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 }} />
    </GeoJSONSource>
  </Map>;
}

export const HomePreview = memo(function HomePreview({ paths, active, label, unavailable = false, synthetic = false }: {
  paths: HomePath[]; active: boolean; label: string; unavailable?: boolean; synthetic?: boolean;
}) {
  const c = useThemeColors();
  const { fontScale } = useWindowDimensions();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  const signature = JSON.stringify(paths);
  // Repository polling returns fresh arrays. Keep unchanged native maps mounted.
  const stablePaths = useMemo(() => JSON.parse(signature) as HomePath[], [signature]);
  const uri = useMemo(() => homePathSvg(stablePaths, c.selected), [stablePaths, c.selected]);
  const style = baseStyle ? themedMapStyle(baseStyle, c.background !== '#FFFFFF') : null;
  const key = `${signature}/${style}`, [failedKey, setFailedKey] = useState(''), [imageFailed, setImageFailed] = useState('');
  const fail = useMemo(() => () => setFailedKey(key), [key]);
  // Reserve the scaled attribution row so it cannot cover route endpoints.
  const drawingArea = [StyleSheet.absoluteFill, { bottom: uri && !synthetic ? 12 * fontScale : 0 }];
  return <View accessible accessibilityLabel={label} pointerEvents="none" style={{ aspectRatio: 1, width: '100%', backgroundColor: c.navigation, borderRadius: 14, overflow: 'hidden', justifyContent: 'center' }}>
    {uri && imageFailed !== uri ? <Image source={{ uri }} contentFit="contain" style={drawingArea} onError={() => setImageFailed(uri)} />
      : <AppText variant="caption" style={{ color: c.muted, padding: 8, textAlign: 'center' }}>{unavailable ? '경로를 읽지 못했어요' : '경로 기록이 없어요'}</AppText>}
    {active && foreground && uri && style && !synthetic && failedKey !== key && <View style={drawingArea}><PreviewMap key={style} paths={stablePaths} styleUrl={style} onFailure={fail} /></View>}
    {!!uri && !synthetic && <AppText style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: c.background, color: c.subtle, fontSize: 8, lineHeight: 12, textAlign: 'center' }}>© MapTiler © OSM</AppText>}
  </View>;
});
