import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Icon } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import MapSurface from '@/modules/map/MapSurface';
import { mapStyleUrl } from '@/modules/map/config';
import { savedCourseOverlay } from '@/modules/courses/model';
import { locateForeground, type Position } from '@/modules/location/locate';
import { expoLocationProvider } from '@/modules/location/expo-provider';
import { useThemeColors } from '@/theme/ThemeProvider';
import { candidateDrafts } from './model';

export default function CourseMapScreen() {
  const params = useLocalSearchParams<{ draft?: string; target?: string }>(), auth = useAuth(), c = useThemeColors();
  const owner = auth.account?.id ?? 'guest';
  const draft = useMemo(() => candidateDrafts.get(params.draft, owner), [params.draft, owner]);
  const overlay = useMemo(() => draft ? savedCourseOverlay(draft.snapshot) : null, [draft]);
  const [position, setPosition] = useState<Position | null>(null), [locating, setLocating] = useState(false);
  const [message, setMessage] = useState(''), [settings, setSettings] = useState<'permission' | 'services' | null>(null);
  const request = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { request.current?.abort(); request.current = null; setLocating(false); }, []);
  useFocusEffect(useCallback(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    return () => { listener.remove(); cancel(); };
  }, [cancel]));
  const back = () => { cancel(); if (router.canGoBack()) router.back(); else router.replace('/route-lab'); };
  const locate = async () => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller; setLocating(true); setMessage(''); setSettings(null);
    const result = await locateForeground(expoLocationProvider, controller.signal);
    if (request.current !== controller || controller.signal.aborted) return;
    request.current = null; setLocating(false);
    if (result.kind === 'located') setPosition(result.position);
    else if (result.kind === 'denied') { setMessage('현재 위치를 확인하려면 위치 권한을 허용해 주세요.'); if (!result.canAskAgain) setSettings('permission'); }
    else if (result.kind === 'services-disabled') { setMessage('기기 설정에서 위치 기능을 켜 주세요.'); setSettings('services'); }
    else if (result.kind !== 'cancelled') setMessage('현재 위치를 확인하지 못했어요. 다시 시도해 주세요.');
  };
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
    <View style={{ height: 80, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface }}>
      <Pressable testID="course-map-back" accessibilityRole="button" accessibilityLabel="뒤로" onPress={back} style={{ width: 64, height: 56, justifyContent: 'center', alignItems: 'center' }}><Icon name="chevronLeft" color={c.text} /></Pressable>
      <AppText weight="bold" variant="title" style={{ flex: 1, textAlign: 'center' }}>지도에서 코스 보기</AppText><View style={{ width: 64 }} />
    </View>
    {draft && overlay ? <View style={{ flex: 1 }}>
      <MapSurface styleUrl={mapStyleUrl(process.env.EXPO_PUBLIC_MAPTILER_API_KEY) ?? ''} origin={draft.snapshot.origin} routeOverlay={overlay}
        position={position} showTarget={params.target !== '0'} interactive onUserMoveStart={cancel}
        syntheticRoads={draft.snapshot.source === 'synthetic' ? { type: 'FeatureCollection', features: [] } : undefined} routeColors={{ route: '#FF5264', target: '#5197FE' }} />
      <Pressable testID="course-map-locate" accessibilityRole="button" accessibilityLabel="현재 위치" disabled={locating} accessibilityState={{ disabled: locating, busy: locating }}
        onPress={() => void locate()} style={{ position: 'absolute', right: 25, top: 39, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, justifyContent: 'center', alignItems: 'center' }}>
          {locating ? <ActivityIndicator color={c.text} /> : <Image source={require('../../../assets/generation/recommendations/locate.svg')} style={{ width: 16, height: 16 }} accessible={false} contentFit="contain" />}
        </View>
      </Pressable>
      {!!message && <View style={{ position: 'absolute', top: 100, left: 24, right: 24, backgroundColor: c.surface, borderRadius: 16, padding: 12, gap: 8 }}>
        <AppText accessibilityLiveRegion="polite" variant="caption">{message}</AppText>
        {!!settings && <Button compact label="설정 열기" onPress={() => {
          const action = settings === 'services' && Platform.OS === 'android' ? Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS') : Linking.openSettings();
          void action.catch(() => setMessage('기기 설정에서 위치 권한과 위치 기능을 확인해 주세요.'));
        }} />}
      </View>}
    </View> : <View style={{ padding: 24, gap: 16 }}><AppText>추천 코스가 만료됐어요. 추천 화면에서 다시 열어 주세요.</AppText><Button label="추천 화면으로 돌아가기" onPress={back} /></View>}
  </SafeAreaView>;
}
