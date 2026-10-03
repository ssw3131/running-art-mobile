import { AppState, PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { RunError } from './model';
import type { TrackingDriver } from './controller';
import { guidanceActivity } from '../guidance/activity';
import { guidanceNative } from '../guidance/native';
import { locateForeground } from '../location/locate';
import { expoLocationProvider } from '../location/expo-provider';

export const RUNNING_TASK = 'running-art-gps-v1';
export const trackingDriver: TrackingDriver = {
  async prepare() {
    if (guidanceActivity.active()) throw new RunError('모의 러닝 안내 시험을 종료한 뒤 GPS 러닝을 시작해 주세요.');
    if (Platform.OS !== 'android' || !await TaskManager.isAvailableAsync()) throw new RunError('러닝 추적은 Android 설치 앱에서 사용할 수 있어요.');
    let foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) throw new RunError('러닝을 기록하려면 위치 권한이 필요해요. 앱 설정에서 허용해 주세요.');
    if (foreground.android?.accuracy !== 'fine') throw new RunError('정확한 러닝 경로를 위해 앱 위치 설정에서 정확한 위치를 켜 주세요.');
    if (Number(Platform.Version) >= 33 && !await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) {
      const notification = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (notification !== PermissionsAndroid.RESULTS.GRANTED) throw new RunError('잠금 화면에 러닝 알림을 표시하려면 앱 설정에서 알림을 허용해 주세요.');
    }
    const background = await Location.getBackgroundPermissionsAsync();
    if (!background.granted && !(await Location.requestBackgroundPermissionsAsync()).granted) {
      throw new RunError('화면이 잠겨도 기록하려면 위치 권한을 항상 허용으로 설정해 주세요.');
    }
    if (!await Location.hasServicesEnabledAsync()) throw new RunError('기기의 위치 기능을 켠 뒤 다시 시작해 주세요.');
  },
  async start() {
    if (AppState.currentState !== 'active') throw new RunError('앱 화면으로 돌아와 러닝을 재개해 주세요.');
    guidanceNative?.prepareLive();
    await Location.startLocationUpdatesAsync(RUNNING_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000, distanceInterval: 0,
      deferredUpdatesDistance: 0, deferredUpdatesInterval: 0,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'RunPen 러닝 기록 중',
        notificationBody: '화면이 잠겨도 GPS 기록과 코스 안내를 계속합니다. 앱에서 일시정지하거나 종료하세요.',
        notificationColor: '#183C32', killServiceOnDestroy: true,
      },
    });
  },
  async stop() {
    if (Platform.OS === 'android' && await Location.hasStartedLocationUpdatesAsync(RUNNING_TASK)) await Location.stopLocationUpdatesAsync(RUNNING_TASK);
  },
  async locate() {
    const result = await locateForeground(expoLocationProvider, new AbortController().signal, { askPermission: false });
    if (result.kind !== 'located') throw new RunError('출발 위치를 확인하지 못했어요. GPS 상태를 확인하고 다시 시작해 주세요.');
    return result.position;
  },
  feedback(events, voice) {
    // Late batched events are persisted for de-duplication but never queued as
    // obsolete speech. Keep the latest instruction; preserve an off-route buzz.
    const latest = events.at(-1);
    if (latest) guidanceNative?.feedbackLive(latest.id, voice ? latest.text : '', events.some(event => event.vibrate));
  },
  silence() { guidanceNative?.silenceLive(); },
  foreground() { return AppState.currentState === 'active'; },
  async healthy() {
    const [foreground, background, services, started] = await Promise.all([
      Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync(),
      Location.hasServicesEnabledAsync(), Location.hasStartedLocationUpdatesAsync(RUNNING_TASK),
    ]);
    return foreground.granted && foreground.android?.accuracy === 'fine' && background.granted && services && started;
  },
};
