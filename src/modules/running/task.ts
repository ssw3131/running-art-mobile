import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { RUNNING_TASK } from './native-driver';
import { running } from './runtime';

// Imported before Expo Router, including headless background launches.
TaskManager.defineTask<{ locations?: LocationObject[] }>(RUNNING_TASK, async ({ data, error }) => {
  await running.ingest((data?.locations ?? []).map(location => ({
    timestamp: location.timestamp, latitude: location.coords.latitude,
    longitude: location.coords.longitude, accuracy: location.coords.accuracy,
  })), error ? 'GPS 수신 오류로 기록을 중단했어요. 위치 설정을 확인하고 재개해 주세요.' : undefined);
});
