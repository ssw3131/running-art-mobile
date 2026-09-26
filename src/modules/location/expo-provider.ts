import * as Location from 'expo-location';

import type { LocationProvider } from './locate';

export const expoLocationProvider: LocationProvider = {
  getPermission: Location.getForegroundPermissionsAsync,
  requestPermission: Location.requestForegroundPermissionsAsync,
  servicesEnabled: Location.hasServicesEnabledAsync,
  watch: (onPosition, onError) => Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 0,
      timeInterval: 1000,
      // Use the available device providers; do not trigger Google accuracy opt-in dialogs.
      mayShowUserSettingsDialog: false,
    },
    ({ coords, timestamp }) => onPosition({
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      timestamp,
    }),
    onError,
  ),
};
