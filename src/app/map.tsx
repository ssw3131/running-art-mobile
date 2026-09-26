import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentLocation, type LocationState } from '@/features/map/use-current-location';
import { mapStyleUrl } from '@/modules/map/config';
import MapSurface from '@/modules/map/MapSurface';

const styleUrl = mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY);

function locationMessage(state: LocationState): [string, string] {
  switch (state.kind) {
    case 'idle': return ['내 주변에서 시작해 보세요', '현재 위치를 확인하려면 위치 접근을 허용해 주세요. 권한 없이도 지도는 둘러볼 수 있어요.'];
    case 'loading': return ['현재 위치를 확인하고 있어요', '위치 신호를 기다리고 있어요. 잠시만 기다려 주세요.'];
    case 'located': return ['위치를 확인했어요', `마지막으로 확인한 위치예요. 이동했다면 다시 확인해 주세요.${state.position.accuracy !== null ? ` 정확도 약 ${Math.round(state.position.accuracy)}m.` : ''}`];
    case 'denied': return ['위치 권한이 필요해요', state.canAskAgain ? '내 위치를 표시하려면 위치 접근을 허용해 주세요. 지도를 둘러보는 것은 계속할 수 있어요.' : '앱 설정에서 위치 권한을 허용해 주세요. 돌아오면 권한을 다시 확인해요.'];
    case 'services-disabled': return ['기기의 위치 기능이 꺼져 있어요', '위치 설정에서 위치 기능을 켜고 다시 확인해 주세요.'];
    case 'timeout': return ['위치 확인이 오래 걸리고 있어요', '신호가 잘 잡히는 곳으로 이동하거나 기기의 위치 설정을 확인한 뒤 다시 시도해 주세요.'];
    case 'unavailable': return ['위치를 확인하지 못했어요', '기기의 위치 설정과 권한을 확인한 뒤 다시 시도해 주세요.'];
  }
}

export default function MapScreen() {
  const { state, locate } = useCurrentLocation();
  const [settingsError, setSettingsError] = useState(false);
  const [title, description] = locationMessage(state);
  const blocked = state.kind === 'denied' && !state.canAskAgain;
  const servicesDisabled = state.kind === 'services-disabled';
  const loading = state.kind === 'loading';

  const openSettings = async () => {
    setSettingsError(false);
    try {
      if (servicesDisabled && Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
      } else {
        await Linking.openSettings();
      }
    } catch {
      setSettingsError(true);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <View style={styles.map}>
        {styleUrl ? <MapSurface styleUrl={styleUrl} position={state.kind === 'located' ? state.position : null} /> : (
          <View style={styles.placeholder} testID="map-not-configured">
            <Text style={styles.placeholderTitle}>지도 연결을 준비하고 있어요</Text>
            <Text style={styles.placeholderText}>지도 서비스 설정이 필요해요.{ '\n' }아래에서 내 위치 확인은 먼저 사용할 수 있어요.</Text>
          </View>
        )}
      </View>
      {styleUrl && (
        <View style={styles.attribution}>
          <Pressable accessibilityRole="link" accessibilityLabel="MapTiler 홈페이지" onPress={() => void Linking.openURL('https://www.maptiler.com/').catch(() => {})}>
            <Image source={require('@/assets/images/maptiler-logo.png')} style={styles.maptilerLogo} resizeMode="contain" />
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.maptiler.com/copyright/').catch(() => {})}><Text style={styles.credit}>© MapTiler</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}><Text style={styles.credit}>© OpenStreetMap contributors</Text></Pressable>
        </View>
      )}
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <View accessibilityLiveRegion="polite" testID={`location-${state.kind}`} style={styles.message}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: loading, busy: loading }}
          disabled={loading}
          testID="locate-button"
          style={[styles.button, loading && styles.disabled]}
          onPress={() => { setSettingsError(false); if (blocked) void openSettings(); else void locate(); }}
        >
          {loading && <ActivityIndicator color="#FFFFFF" />}
          <Text style={styles.buttonText}>{blocked ? '앱 설정 열기' : loading ? '위치 확인 중…' : state.kind === 'located' ? '내 위치 다시 확인' : '현재 위치 확인'}</Text>
        </Pressable>
        {servicesDisabled && <Pressable accessibilityRole="button" onPress={() => void openSettings()} style={styles.settingsButton}><Text style={styles.settingsText}>위치 설정 열기</Text></Pressable>}
        {settingsError && <Text accessibilityRole="alert" style={styles.description}>설정을 열지 못했어요. 기기의 설정 앱에서 위치 권한을 변경해 주세요.</Text>}
        <Text style={styles.footnote}>위치는 요청할 때 한 번 확인하며, 러닝 기록으로 저장하지 않아요.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F5F0' },
  map: { flex: 1, minHeight: 180 },
  placeholder: { flex: 1, padding: 28, backgroundColor: '#E8EDE7', justifyContent: 'center', alignItems: 'center', gap: 14 },
  placeholderTitle: { color: '#183C32', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  placeholderText: { color: '#57675F', fontSize: 15, lineHeight: 24, textAlign: 'center' },
  panel: { flexGrow: 0, maxHeight: '47%' },
  panelContent: { padding: 22, gap: 16 },
  message: { gap: 8 },
  title: { color: '#183C32', fontSize: 22, fontWeight: '700' },
  description: { color: '#57675F', fontSize: 15, lineHeight: 23 },
  button: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#183C32', padding: 17, borderRadius: 14 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.65 },
  settingsButton: { padding: 12, alignItems: 'center' },
  settingsText: { color: '#183C32', fontSize: 15, textDecorationLine: 'underline' },
  footnote: { color: '#57675F', fontSize: 12, lineHeight: 19 },
  attribution: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 8, backgroundColor: '#FFFFFF' },
  maptilerLogo: { width: 82, height: 24 },
  credit: { color: '#57675F', fontSize: 11, textDecorationLine: 'underline', paddingVertical: 4 },
});
