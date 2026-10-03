import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { mapStyleUrl } from '@/modules/map/config';
import type { Coordinate } from '@/modules/guidance/geometry';
import type { GuidanceState } from '@/modules/guidance/engine';

const basicStyle = { version: 8 as const, sources: {}, layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#EDEFEA' } }] };
const styleUrl = mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY);
const line = (coordinates: Coordinate[]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } });
export default function GuidanceMap({ route, state }: { route: Coordinate[]; state: GuidanceState }) {
  const camera = useRef<CameraRef>(null);
  const [follow, setFollow] = useState(true), [online, setOnline] = useState(!!styleUrl), [ready, setReady] = useState(false);
  const routeData = useMemo(() => line(route), [route]);
  useEffect(() => {
    if (!ready || !follow) return;
    camera.current?.easeTo({ center: state.position, zoom: 16.5, duration: 200 });
  }, [follow, ready, state.position]);
  useEffect(() => {
    if (ready || !online) return;
    const timeout = setTimeout(() => { setOnline(false); }, 8000);
    return () => clearTimeout(timeout);
  }, [ready, online]);
  const paths = { type: 'FeatureCollection' as const, features: state.trace.filter(p => p.length >= 2).map(line) };
  return <View style={styles.fill}>
    <Map key={online ? 'online' : 'offline'} testID="guidance-map" style={styles.fill} mapStyle={online && styleUrl ? styleUrl : basicStyle} attribution logo={false}
      onDidFinishLoadingMap={() => setReady(true)} onDidFailLoadingMap={() => { setReady(false); setOnline(false); }}
      onRegionWillChange={event => { if (event.nativeEvent.userInteraction) setFollow(false); }}>
      <Camera ref={camera} initialViewState={{ center: route[0], zoom: 16 }} />
      <GeoJSONSource id="guidance-course" data={routeData}>
        <Layer id="guidance-course-outline" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 10 }} />
        <Layer id="guidance-course-line" type="line" paint={{ 'line-color': '#FF674C', 'line-width': 6 }} />
      </GeoJSONSource>
      <GeoJSONSource id="guidance-trace" data={paths}><Layer id="guidance-trace-line" type="line" paint={{ 'line-color': '#117CB0', 'line-width': 4 }} /></GeoJSONSource>
      {state.returnPath.length >= 2 && <GeoJSONSource id="guidance-return" data={line(state.returnPath)}><Layer id="guidance-return-line" type="line" paint={{ 'line-color': '#9C4308', 'line-width': 5, 'line-dasharray': [2, 1] }} /></GeoJSONSource>}
      <GeoJSONSource id="guidance-position" data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: state.position } }}>
        <Layer id="guidance-halo" type="circle" paint={{ 'circle-radius': 18, 'circle-color': '#298CD5', 'circle-opacity': 0.2 }} />
        <Layer id="guidance-dot" type="circle" paint={{ 'circle-radius': 8, 'circle-color': '#147FC1', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 4 }} />
      </GeoJSONSource>
    </Map>
    <Pressable testID="guidance-recenter" accessibilityLabel="가상 위치로 지도 이동" accessibilityRole="button" style={styles.recenter} onPress={() => setFollow(true)}><Text style={styles.cross}>◎</Text></Pressable>
    <View style={styles.credits}>
      <Text style={styles.credit}>{online ? '© OpenStreetMap contributors' : '배경 지도 없이 경로 표시'}</Text>
      {online && <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.maptiler.com/copyright/')}><Image source={require('@/assets/images/maptiler-logo.png')} style={{ width: 60, height: 16 }} resizeMode="contain" /></Pressable>}
      <Pressable testID="guidance-background" accessibilityRole="button" onPress={() => { setReady(false); setOnline(value => !value && !!styleUrl); }}><Text style={styles.credit}>{online ? '배경 끄기' : '배경 켜기'}</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, recenter: { position: 'absolute', top: 190, right: 18, width: 46, height: 46, backgroundColor: '#FFF', borderRadius: 24, alignItems: 'center', justifyContent: 'center', elevation: 3 }, cross: { color: '#173047', fontSize: 28 }, credits: { position: 'absolute', bottom: 2, left: 6, right: 6, flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap', backgroundColor: '#FFFFFFD9' }, credit: { fontSize: 10, color: '#334F55' } });
