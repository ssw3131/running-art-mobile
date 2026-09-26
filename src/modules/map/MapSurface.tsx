import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Position } from '@/modules/location/locate';

type Props = { styleUrl: string; position: Position | null };

function MapAttempt({ styleUrl, position, onRetry }: Props & { onRetry(): void }) {
  const camera = useRef<CameraRef>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => setStatus('error'), 20000);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (position && status === 'ready') {
      camera.current?.easeTo({
        center: [position.longitude, position.latitude],
        zoom: position.accuracy !== null && position.accuracy > 500 ? 12 : 16,
        duration: 600,
      });
    }
  }, [position, status]);

  return (
    <View style={styles.fill}>
      <Map
        testID="native-map"
        style={styles.fill}
        mapStyle={styleUrl}
        attribution
        logo={false}
        compass
        onDidFinishLoadingMap={() => setStatus('ready')}
        onDidFailLoadingMap={() => setStatus('error')}
      >
        <Camera ref={camera} initialViewState={{ center: [127.8, 36.3], zoom: 6 }} />
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
