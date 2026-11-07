import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CourseMapScreen from '../../src/features/course-generation/CourseMapScreen';
import { candidateDrafts } from '../../src/features/course-generation/model';
import { courseFromCalculation } from '../../src/features/route-lab/saved-course';
import { locateForeground } from '../../src/modules/location/locate';
import { router } from 'expo-router';
let mockParams: any, mockMap: any, mockOwner: any;
jest.mock('../../src/features/auth/use-auth', () => ({ useAuth: () => ({ account: mockOwner }) }));
jest.mock('../../src/modules/location/locate', () => ({ locateForeground: jest.fn() }));
jest.mock('../../src/modules/location/expo-provider', () => ({ expoLocationProvider: {} }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() }, useFocusEffect: (effect: any) => require('react').useEffect(effect, [effect]) }));
jest.mock('../../src/modules/map/MapSurface', () => ({ __esModule: true, default: (props: any) => { mockMap = props; return require('react').createElement(require('react-native').View); } }));
beforeEach(() => {
  candidateDrafts.clear(); jest.mocked(locateForeground).mockReset(); mockOwner = { id: 'owner' }; mockMap = null;
  const grid = require('../../assets/route-lab/grid.json');
  const result = require('../fixtures/route-engine/grid-heart-v02.json').result;
  const snapshot = courseFromCalculation({ result, origin: grid.origin, options: grid.options, liveRoads: false } as any, 0);
  mockParams = { draft: candidateDrafts.put(snapshot, 1, 'owner'), target: '0' };
});
test('expanded map keeps the selected route and permits gestures, GPS and back', async () => {
  const position = { latitude: 37.57, longitude: 126.98, accuracy: 5, timestamp: 1 };
  jest.mocked(locateForeground).mockResolvedValue({ kind: 'located', position });
  await render(<CourseMapScreen />);
  const overlay = mockMap.routeOverlay;
  expect(mockMap.interactive).toBe(true); expect(mockMap.showTarget).toBe(false);
  await fireEvent.press(screen.getByTestId('course-map-locate'));
  expect(mockMap.position).toEqual(position); expect(mockMap.routeOverlay).toBe(overlay);
  await fireEvent.press(screen.getByTestId('course-map-back')); expect(router.back).toHaveBeenCalled();
});
test('manual map movement cancels late GPS recentering', async () => {
  let resolve!: (value: any) => void;
  jest.mocked(locateForeground).mockImplementation(() => new Promise(done => { resolve = done; }));
  await render(<CourseMapScreen />);
  await fireEvent.press(screen.getByTestId('course-map-locate'));
  await act(() => mockMap.onUserMoveStart());
  expect(jest.mocked(locateForeground).mock.calls[0][1].aborted).toBe(true);
  await act(async () => resolve({ kind: 'located', position: { latitude: 37.57, longitude: 126.98, accuracy: 5, timestamp: 1 } }));
  expect(mockMap.position).toBeNull();
});
test('a different account cannot view the private draft', async () => {
  mockOwner = { id: 'other' }; await render(<CourseMapScreen />);
  expect(screen.getByText('추천 코스가 만료됐어요. 추천 화면에서 다시 열어 주세요.')).toBeVisible();
  expect(mockMap).toBeNull();
});

test('eye toggles only target geometry and preserves the selected course and GPS camera', async () => {
  await render(<CourseMapScreen />);
  const route = mockMap.routeOverlay;
  expect(screen.getByTestId('course-map-target-toggle').props.accessibilityState.checked).toBe(false);
  await fireEvent.press(screen.getByTestId('course-map-target-toggle'));
  expect(mockMap.showTarget).toBe(true); expect(mockMap.routeOverlay).toBe(route);
  await fireEvent.press(screen.getByTestId('course-map-target-toggle'));
  expect(mockMap.showTarget).toBe(false); expect(mockMap.routeOverlay).toBe(route);
});
