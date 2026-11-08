import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CourseLocationPickerScreen from '../../src/features/course-generation/CourseLocationPickerScreen';
import { locateForeground } from '../../src/modules/location/locate';

let mockMapProps: any;
jest.mock('../../src/modules/location/locate', () => ({ locateForeground: jest.fn() }));
jest.mock('../../src/modules/location/expo-provider', () => ({ expoLocationProvider: {} }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}), router: { back: jest.fn() },
  useFocusEffect: (effect: any) => require('react').useEffect(effect, [effect]),
}));
jest.mock('../../src/modules/map/MapSurface', () => ({ __esModule: true, default: (props: any) => {
  mockMapProps = props; return require('react').createElement(require('react-native').View);
} }));
beforeEach(() => jest.mocked(locateForeground).mockReset());

test('current location moves the picker and exposes confirmation without publishing it', async () => {
  jest.mocked(locateForeground).mockResolvedValue({ kind: 'located', position: { latitude: 37.57, longitude: 126.98, accuracy: 5, timestamp: Date.now() } });
  await render(<CourseLocationPickerScreen />);
  await fireEvent.press(screen.getByTestId('location-picker-locate'));
  expect(mockMapProps.origin).toEqual({ lat: 37.57, lng: 126.98 });
  expect(screen.getByTestId('confirm-course-location')).toBeVisible();
});

test('a manual pan cancels a pending fix so late GPS cannot replace the selected center', async () => {
  let resolve!: (value: any) => void;
  jest.mocked(locateForeground).mockImplementation(() => new Promise(done => { resolve = done; }));
  await render(<CourseLocationPickerScreen />);
  const initial = mockMapProps.origin;
  await fireEvent.press(screen.getByTestId('location-picker-locate'));
  const signal = jest.mocked(locateForeground).mock.calls[0][1];
  await act(() => mockMapProps.centerSelection.onMoveStart());
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ kind: 'located', position: { latitude: 37.57, longitude: 126.98, accuracy: 5, timestamp: Date.now() } }));
  expect(mockMapProps.origin).toEqual(initial);
});

test('permanent permission denial keeps the current center and offers settings', async () => {
  jest.mocked(locateForeground).mockResolvedValue({ kind: 'denied', canAskAgain: false });
  await render(<CourseLocationPickerScreen />);
  const initial = mockMapProps.origin;
  await fireEvent.press(screen.getByTestId('location-picker-locate'));
  expect(mockMapProps.origin).toEqual(initial);
  expect(screen.getByTestId('location-picker-settings')).toBeVisible();
  expect(screen.getByText('현재 위치를 확인하려면 위치 권한을 허용해 주세요.')).toBeVisible();
});
