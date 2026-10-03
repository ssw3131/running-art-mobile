import { AppState, PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { RunError } from './model';
import type { TrackingDriver } from './controller';
import { guidanceActivity } from '../guidance/activity';

export const RUNNING_TASK = 'running-art-gps-v1';
export const trackingDriver: TrackingDriver = {
  async prepare() {
    if (guidanceActivity.active()) throw new RunError('모의 러닝 안내 시험을 종료한 뒤 GPS 러닝을 시작해 주세요.');
    if (Platform.OS !== 'android' || !await TaskManager.isAvailableAsync()) throw new RunError('러닝 추적은 Android 설치 앱에서 사용할 수 있어요.');
    const foreground = await Location.requestForegroundPermissionsAsync();
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
    await Location.startLocationUpdatesAsync(RUNNING_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000, distanceInterval: 0,
      deferredUpdatesDistance: 0, deferredUpdatesInterval: 0,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Running Art 러닝 기록 중',
        notificationBody: '화면이 잠겨도 GPS를 기록합니다. 앱에서 일시정지하거나 종료하세요.',
        notificationColor: '#183C32', killServiceOnDestroy: true,
      },
    });
  },
  async stop() {
    if (Platform.OS === 'android' && await Location.hasStartedLocationUpdatesAsync(RUNNING_TASK)) await Location.stopLocationUpdatesAsync(RUNNING_TASK);
  },
  async healthy() {
    const [foreground, background, services, started] = await Promise.all([
      Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync(),
      Location.hasServicesEnabledAsync(), Location.hasStartedLocationUpdatesAsync(RUNNING_TASK),
    ]);
    return foreground.granted && foreground.android?.accuracy === 'fine' && background.granted && services && started;
  },
};
