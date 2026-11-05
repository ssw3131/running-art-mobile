import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Icon } from '@/components/ui';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import type { Origin } from '@/modules/route-engine/types';
import { datasets } from '@/features/route-lab/fixtures';
import { useThemeColors } from '@/theme/ThemeProvider';
import { centerLabel } from './model';
import { PlaceSearch } from './PlaceSearch';
import { publishCourseLocation } from './location-picker-handoff';

const styleUrl = mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY);
const toOrigin = (lat?: string, lng?: string): Origin | null => {
  const latitude = Number(lat), longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= 33 && latitude < 39 && longitude >= 124 && longitude < 132
    ? { lat: latitude, lng: longitude } : null;
};

export default function CourseLocationPickerScreen() {
  const params = useLocalSearchParams<{ lat?: string; lng?: string; address?: string }>();
  const c = useThemeColors();
  const initialOrigin = useState(() => toOrigin(params.lat, params.lng) ?? datasets.seoul.input.origin)[0];
  const [origin, setOrigin] = useState<Origin>(initialOrigin);
  const [cameraTarget, setCameraTarget] = useState({ center: initialOrigin, revision: 0 });
  const [address, setAddress] = useState(params.address ?? '');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [mapMessage, setMapMessage] = useState('');
  const [sheetOffset] = useState(() => new Animated.Value(280));

  useEffect(() => {
    const animation = Animated.timing(sheetOffset, { toValue: sheetVisible ? 0 : 280, duration: sheetVisible ? 220 : 150, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [sheetOffset, sheetVisible]);

  const onMoveStart = useCallback(() => { setSheetVisible(false); setMapMessage(''); }, []);
  const onMoveEnd = useCallback((center: Origin | null) => {
    if (!center) { setMapMessage('지원 범위 안에서 위치를 선택해 주세요.'); return; }
    setOrigin(center); setAddress(''); setSheetVisible(true); setMapMessage('');
  }, []);
  const centerSelection = useMemo(() => ({ target: cameraTarget, onMoveStart, onMoveEnd, onReady: () => undefined }), [cameraTarget, onMoveEnd, onMoveStart]);
  const selectPlace = (place: { address: string; center: Origin }) => {
    setOrigin(place.center);
    setCameraTarget(current => ({ center: place.center, revision: current.revision + 1 }));
    setAddress(place.address);
    setSheetVisible(true);
    setMapMessage('');
  };
  const confirm = () => {
    publishCourseLocation({ origin, ...(address ? { address } : {}) });
    router.back();
  };

  return <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
    <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
      <Pressable testID="location-picker-back" accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.back}>
        <Icon name="chevronLeft" color={c.text} />
      </Pressable>
      <AppText variant="heading" weight="bold" style={styles.headerTitle}>출발 위치 선택</AppText>
      <View style={styles.back} />
    </View>
    <View style={{ paddingHorizontal: 20, paddingVertical: 12, backgroundColor: c.surface, zIndex: 1 }}>
      <PlaceSearch compact center={origin} onChoose={selectPlace} />
    </View>
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <MapSurface styleUrl={styleUrl ?? ''} position={null} origin={origin} centerSelection={centerSelection} />
      <View pointerEvents="none" style={styles.centerMarker}>
        <View style={[styles.markerRing, { backgroundColor: c.action, borderColor: c.surface }]}>
          <View style={[styles.markerCore, { backgroundColor: c.surface }]} />
        </View>
        <View style={[styles.markerTip, { borderTopColor: c.action }]} />
      </View>
      {!!mapMessage && <View pointerEvents="none" style={[styles.mapMessage, { backgroundColor: c.surface }]}><AppText variant="caption">{mapMessage}</AppText></View>}
      <Animated.View pointerEvents={sheetVisible ? 'auto' : 'none'} accessibilityElementsHidden={!sheetVisible} importantForAccessibility={sheetVisible ? 'auto' : 'no-hide-descendants'}
        style={[styles.sheet, { backgroundColor: c.surface, transform: [{ translateY: sheetOffset }] }]}>
        <View style={[styles.handle, { backgroundColor: c.divider }]} />
        <AppText variant="caption" weight="bold" style={{ color: c.muted }}>출발 위치</AppText>
        <AppText variant="heading" weight="bold" testID="picked-location-address">{address || '지도에서 선택한 위치'}</AppText>
        <AppText variant="caption" style={{ color: c.subtle }}>{centerLabel(origin)} · 지도를 움직여 중심 핀 위치를 맞춰주세요.</AppText>
        <Button testID="confirm-course-location" label="이 위치 사용" onPress={confirm} />
      </Animated.View>
    </View>
  </SafeAreaView>;
}

const styles = {
  header: { height: 64, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, borderBottomWidth: 1 },
  back: { width: 56, height: 56, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerTitle: { flex: 1, textAlign: 'center' as const },
  centerMarker: { position: 'absolute' as const, left: '50%' as const, top: '50%' as const, marginLeft: -14, marginTop: -27, alignItems: 'center' as const },
  markerRing: { width: 28, height: 28, borderRadius: 14, borderWidth: 3, alignItems: 'center' as const, justifyContent: 'center' as const, zIndex: 1 },
  markerCore: { width: 8, height: 8, borderRadius: 4 },
  markerTip: { width: 0, height: 0, marginTop: -3, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 12, borderLeftColor: 'transparent' as const, borderRightColor: 'transparent' as const },
  mapMessage: { position: 'absolute' as const, top: 12, alignSelf: 'center' as const, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  sheet: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, gap: 12, borderTopLeftRadius: 22, borderTopRightRadius: 22, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, elevation: 12 },
  handle: { width: 52, height: 5, borderRadius: 3, alignSelf: 'center' as const, marginBottom: 4 },
};
