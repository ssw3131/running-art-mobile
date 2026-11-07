import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Keyboard, Linking, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Icon } from '@/components/ui';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import type { Origin } from '@/modules/route-engine/types';
import { datasets } from '@/features/route-lab/fixtures';
import { useThemeColors } from '@/theme/ThemeProvider';
import { PlaceSearch } from './PlaceSearch';
import { publishCourseLocation } from './location-picker-handoff';
import { Image } from 'expo-image';
import { usePointAddress } from './use-point-address';
import { GenerationIcon } from './GenerationIcon';
import { locateForeground } from '@/modules/location/locate';
import { expoLocationProvider } from '@/modules/location/expo-provider';
import { centerFromMap } from '@/modules/map/coordinates';

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
  const [mapMoving, setMapMoving] = useState(false);
  const [mapMessage, setMapMessage] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationSettings, setLocationSettings] = useState<'permission' | 'services' | null>(null);
  const locationRequest = useRef<AbortController | null>(null);
  const pointAddress = usePointAddress(origin, address);
  const cancelLocation = useCallback(() => { locationRequest.current?.abort(); locationRequest.current = null; setLocating(false); }, []);
  useFocusEffect(useCallback(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') cancelLocation(); });
    return () => { subscription.remove(); cancelLocation(); };
  }, [cancelLocation]));

  const onMoveStart = useCallback(() => { cancelLocation(); setMapMoving(true); setMapMessage(''); setLocationSettings(null); }, [cancelLocation]);
  const onMoveEnd = useCallback((center: Origin | null) => {
    if (!center) { setMapMessage('지원 범위 안에서 위치를 선택해 주세요.'); return; }
    setOrigin(center); setAddress(''); setMapMoving(false); setMapMessage('');
  }, []);
  const centerSelection = useMemo(() => ({ target: cameraTarget, onMoveStart, onMoveEnd, onReady: () => undefined }), [cameraTarget, onMoveEnd, onMoveStart]);
  const selectPlace = (place: { address: string; center: Origin }) => {
    cancelLocation(); setLocationSettings(null);
    setOrigin(place.center);
    setCameraTarget(current => ({ center: place.center, revision: current.revision + 1 }));
    setAddress(place.address);
    setMapMoving(false);
    setMapMessage('');
  };
  const locateCurrent = async () => {
    Keyboard.dismiss();
    cancelLocation(); setLocationSettings(null); setMapMessage('');
    const request = new AbortController(); locationRequest.current = request; setLocating(true);
    const result = await locateForeground(expoLocationProvider, request.signal);
    if (locationRequest.current !== request || request.signal.aborted) return;
    locationRequest.current = null; setLocating(false);
    if (result.kind === 'located') {
      const center = centerFromMap([result.position.longitude, result.position.latitude]);
      if (center) selectPlace({ center, address: '' });
      else setMapMessage('현재 위치는 지원 범위 밖이에요. 지도에서 위치를 선택해 주세요.');
    } else if (result.kind === 'denied') {
      setMapMessage('현재 위치를 확인하려면 위치 권한을 허용해 주세요.');
      if (!result.canAskAgain) setLocationSettings('permission');
    } else if (result.kind === 'services-disabled') {
      setMapMessage('기기 설정에서 위치 기능을 켜 주세요.'); setLocationSettings('services');
    } else if (result.kind !== 'cancelled') setMapMessage('현재 위치를 확인하지 못했어요. 다시 시도해 주세요.');
  };
  const openLocationSettings = () => {
    const action = locationSettings === 'services' && Platform.OS === 'android'
      ? Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS') : Linking.openSettings();
    void action.catch(() => setMapMessage('기기 설정을 직접 열어 위치 권한과 위치 기능을 확인해 주세요.'));
  };
  const confirm = () => {
    publishCourseLocation({ origin, ...(pointAddress.address ? { address: pointAddress.address } : {}) });
    router.back();
  };

  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
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
      <Pressable testID="location-picker-locate" accessibilityRole="button" accessibilityLabel="현재 위치" accessibilityState={{ disabled: locating, busy: locating }}
        disabled={locating} onPress={() => void locateCurrent()} style={styles.locateTarget}>
        <View style={[styles.locateButton, { backgroundColor: c.surface, borderColor: c.outline }]}>
          {locating ? <ActivityIndicator size="small" color={c.text} /> : <GenerationIcon name="locate" />}
        </View>
      </Pressable>
      <View pointerEvents="none" style={styles.centerMarker}>
        <View style={[styles.markerRing, { backgroundColor: c.action, borderColor: c.surface }]}>
          <View style={[styles.markerCore, { backgroundColor: c.surface }]} />
        </View>
        <View style={[styles.markerTip, { borderTopColor: c.action }]} />
      </View>
      {!!mapMessage && <View style={[styles.mapMessage, { backgroundColor: c.surface }]}><AppText accessibilityLiveRegion="polite" variant="caption">{mapMessage}</AppText>
        {!!locationSettings && <Button compact variant="outline" label="설정 열기" testID="location-picker-settings" onPress={openLocationSettings} />}
      </View>}

    </View>
    <View testID="location-picker-footer" style={{ paddingHorizontal: 26, paddingTop: 14, paddingBottom: 18, gap: 5, backgroundColor: c.surface }}>
      <AppText family="roboto" weight="semibold" variant="caption" style={{ color: c.subtle }}>출발 위치</AppText>
      <AppText family="roboto" weight="semibold" testID="picked-location-address" style={{ fontSize: 14, lineHeight: 18 }}>{mapMoving ? '위치 선택 중…' : pointAddress.label}</AppText>
      <View style={{ height: 1, backgroundColor: c.divider }} />
      <AppText variant="caption" style={{ color: c.subtle, textAlign: 'center', marginBottom: 7 }}>지도를 움직여 중심 핀 위치를 맞춰주세요.</AppText>
      <Button testID="confirm-course-location" label="이 위치 사용" disabled={mapMoving} onPress={confirm}
        leading={<Image source={require('../../../assets/generation/figma-20261107/confirm-location.svg')} style={{ width: 22, height: 22 }} accessible={false} contentFit="contain" />} />
    </View>
  </SafeAreaView>;
}

const styles = {
  header: { height: 64, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, borderBottomWidth: 1 },
  back: { width: 56, height: 56, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerTitle: { flex: 1, textAlign: 'center' as const },
  locateTarget: { position: 'absolute' as const, left: 23, bottom: 66, width: 48, height: 48, alignItems: 'center' as const, justifyContent: 'center' as const },
  locateButton: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  centerMarker: { position: 'absolute' as const, left: '50%' as const, top: '50%' as const, marginLeft: -14, marginTop: -27, alignItems: 'center' as const },
  markerRing: { width: 28, height: 28, borderRadius: 14, borderWidth: 3, alignItems: 'center' as const, justifyContent: 'center' as const, zIndex: 1 },
  markerCore: { width: 8, height: 8, borderRadius: 4 },
  markerTip: { width: 0, height: 0, marginTop: -3, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 12, borderLeftColor: 'transparent' as const, borderRightColor: 'transparent' as const },
  mapMessage: { position: 'absolute' as const, top: 94, left: 24, right: 24, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, gap: 8 },
};
