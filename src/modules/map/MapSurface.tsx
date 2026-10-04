import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MapSurfaceProps as Props } from './types';
import { centerFromMap } from './coordinates';

const syntheticStyle = { version: 8 as const, sources: {}, layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#F0F2ED' } }] };

function MapAttempt({ styleUrl, position, simulationPosition, routeOverlay, origin, syntheticRoads, centerSelection, onRetry }: Props & { onRetry(): void }) {
  const camera = useRef<CameraRef>(null);
  const selection = useRef(centerSelection);
  const searchOrigin = useRef(origin);
  useLayoutEffect(() => { selection.current = centerSelection; searchOrigin.current = origin; }, [centerSelection, origin]);
  const userMoving = useRef(false);
  const selecting = !!centerSelection;
  const target = centerSelection?.target;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => setStatus('error'), 20000);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (position && status === 'ready' && !selecting) {
      camera.current?.easeTo({
        center: [position.longitude, position.latitude],
        zoom: position.accuracy !== null && position.accuracy > 500 ? 12 : 16,
        duration: 600,
      });
    }
  }, [position, status, selecting]);

  useEffect(() => {
    selection.current?.onReady(status === 'ready');
    return () => selection.current?.onReady(false);
  }, [status]);

  useEffect(() => {
    if (status === 'ready' && target) camera.current?.jumpTo({ center: [target.center.lng, target.center.lat], zoom: 13 });
  }, [status, target]);

  useEffect(() => {
    if (status !== 'ready' || !routeOverlay || (selecting && !routeOverlay.freeStart)) return;
    let bounds = routeOverlay.bounds;
    if (selecting && searchOrigin.current) {
      // Free loops can lie away from the crosshair. Show the whole candidate
      // while retaining the chosen search center; manual panning stays free.
      const { lng, lat } = searchOrigin.current;
      const dx = Math.max(Math.abs(bounds[0] - lng), Math.abs(bounds[2] - lng));
      const dy = Math.max(Math.abs(bounds[1] - lat), Math.abs(bounds[3] - lat));
      bounds = [lng - dx, lat - dy, lng + dx, lat + dy];
    }
    camera.current?.fitBounds(bounds, { padding: { top: 28, bottom: 28, left: 28, right: 28 }, duration: 400 });
  }, [routeOverlay, status, selecting]);

  return (
    <View style={styles.fill}>
      <Map
        testID="native-map"
        style={styles.fill}
        mapStyle={syntheticRoads ? syntheticStyle : styleUrl}
        attribution
        logo={false}
        compass
        onRegionWillChange={(event) => {
          if (event.nativeEvent.userInteraction && !userMoving.current) {
            userMoving.current = true;
            selection.current?.onMoveStart();
          }
        }}
        onRegionIsChanging={(event) => {
          if (event.nativeEvent.userInteraction && !userMoving.current) {
            userMoving.current = true;
            selection.current?.onMoveStart();
          }
        }}
        onRegionDidChange={(event) => {
          if (!userMoving.current && !event.nativeEvent.userInteraction) return;
          userMoving.current = false;
          const center = centerFromMap(event.nativeEvent.center);
          selection.current?.onMoveEnd(center);
        }}
        onDidFinishLoadingMap={() => setStatus('ready')}
        onDidFailLoadingMap={() => setStatus('error')}
      >
        <Camera ref={camera} initialViewState={{ center: origin ? [origin.lng, origin.lat] : [127.8, 36.3], zoom: origin ? 13 : 6 }} />
        {syntheticRoads && <GeoJSONSource id="synthetic-roads" data={syntheticRoads}>
          <Layer id="synthetic-road-lines" type="line" paint={{ 'line-color': '#BFCAC1', 'line-width': 1.5 }} />
        </GeoJSONSource>}
        {routeOverlay && <>
          <GeoJSONSource id="route-target" data={routeOverlay.target}>
            <Layer id="target-line" type="line" paint={{ 'line-color': '#B66A31', 'line-width': 2.5, 'line-dasharray': [3, 2] }} />
          </GeoJSONSource>
          <GeoJSONSource id="selected-route" data={routeOverlay.route}>
            <Layer id="route-outline" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 7 }} />
            <Layer id="route-line" type="line" paint={{ 'line-color': '#23694C', 'line-width': 4 }} />
          </GeoJSONSource>
          {!routeOverlay.freeStart && <GeoJSONSource id="route-start" data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: routeOverlay.start } }}>
            <Layer id="route-start-dot" type="circle" paint={{ 'circle-radius': 6, 'circle-color': '#183C32', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 }} />
          </GeoJSONSource>}
        </>}
        {simulationPosition && <GeoJSONSource id="simulation-position" data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: simulationPosition } }}>
          <Layer id="simulation-halo" type="circle" paint={{ 'circle-radius': 16, 'circle-color': '#3B82F6', 'circle-opacity': 0.2 }} />
          <Layer id="simulation-dot" type="circle" paint={{ 'circle-radius': 7, 'circle-color': '#2563EB', 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' }} />
        </GeoJSONSource>}
        {position && (
          <GeoJSONSource id="current-position" data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [position.longitude, position.latitude] },
          }}>
            <Layer id="position-halo" type="circle" paint={{ 'circle-radius': 18, 'circle-color': '#3B82F6', 'circle-opacity': 0.18 }} />
            <Layer id="position-dot" type="circle" paint={{ 'circle-radius': 7, 'circle-color': '#2563EB', 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' }} />
          </GeoJSONSource>
        )}
      </Map>
      {status !== 'ready' && (
        <View style={styles.overlay} accessibilityLiveRegion="polite">
          {status === 'loading' ? (
            <><ActivityIndicator color="#183C32" /><Text style={styles.message}>지도를 불러오는 중이에요.</Text></>
          ) : (
            <>
              <Text style={styles.title}>지도를 불러오지 못했어요</Text>
              <Text style={styles.message}>네트워크 연결과 지도 서비스 설정을 확인한 뒤 다시 시도해 주세요.</Text>
              <Pressable accessibilityRole="button" testID="retry-map" onPress={onRetry} style={styles.retry}>
                <Text style={styles.retryText}>지도 다시 불러오기</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

export default function MapSurface(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <MapAttempt key={`${props.styleUrl}-${attempt}`} {...props} onRetry={() => setAttempt((value) => value + 1)} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#E8EDE7', padding: 32, justifyContent: 'center', alignItems: 'center', gap: 16 },
  title: { color: '#183C32', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  message: { color: '#57675F', fontSize: 15, lineHeight: 23, textAlign: 'center' },
  retry: { padding: 16, backgroundColor: '#183C32', borderRadius: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
});
