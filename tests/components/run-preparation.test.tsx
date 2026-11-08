import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import CourseRunPreparation from '../../src/features/running/CourseRunPreparation';

let mockPosition: (value: any) => void;
const mockRemove = jest.fn();
jest.mock('expo-router', () => ({ useFocusEffect: (effect: any) => require('react').useEffect(effect, [effect]) }));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  getForegroundPermissionsAsync: async () => ({ granted: true, android: { accuracy: 'fine' } }),
  hasServicesEnabledAsync: async () => true,
  watchPositionAsync: async (_options: any, callback: any) => { mockPosition = callback; return { remove: mockRemove }; },
}));
jest.mock('../../src/modules/storage/database', () => ({ getStorage: async () => ({
  courses: { get: async (id: string) => ({ id, name: '시험 코스', snapshot: { route: [[127,37],[127.001,37],[127,37]], lengthKm: 1 } }) },
  account: { preferences: async () => ({ guidance: { background: true } }) },
}) }));
jest.mock('../../src/modules/running/guidance', () => ({
  validateRunCourse: (course: any) => course,
  startReadiness: (_course: any, fix: any, now: number) => fix && now-fix.timestamp<=5000 && fix.accuracy<=30
    ? { ready:true,distanceM:0,message:'코스 위에 있어요.' } : { ready:false,distanceM:null,message:'정확한 위치를 기다려 주세요.' },
}));
jest.mock('../../src/modules/guidance/engine', () => ({ createGuidance: () => ({ snapshot: () => ({}) }) }));
jest.mock('../../src/features/guidance/GuidanceMap', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/modules/running/navigation', () => ({ planApproach: jest.fn() }));

beforeEach(() => { jest.useFakeTimers(); AppState.currentState='active'; });
afterEach(() => jest.useRealTimers());

test('start stays visible and actionable as GPS expires; confirmation reads the latest preview', async () => {
  const onStart=jest.fn();
  await render(<CourseRunPreparation id="course" busy={false} onStart={onStart}/>);
  expect(screen.getByTestId('run-course-start')).toBeEnabled();
  expect(screen.getByTestId('run-prepare-path')).toBeDisabled();
  await act(async () => { mockPosition({timestamp:Date.now(),coords:{latitude:37,longitude:127,accuracy:5}}); });
  await fireEvent.press(screen.getByTestId('run-course-start'));
  const preparation=onStart.mock.calls[0][0];
  expect(preparation.courseId).toBe('course');
  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(screen.getByTestId('run-readiness')).toHaveTextContent('정확한 위치를 기다려 주세요.');
  expect(screen.getByTestId('run-course-start')).toBeEnabled();
  const timestamp=Date.now();
  await act(async () => { mockPosition({timestamp,coords:{latitude:37,longitude:127.001,accuracy:6}}); });
  expect(preparation.read().fix).toMatchObject({timestamp,longitude:127.001,accuracy:6});
});

test('busy preparation keeps the same start control disabled and releases preview watch on unmount', async () => {
  const onStart=jest.fn();
  const view=await render(<CourseRunPreparation id="course" busy={false} onStart={onStart}/>);
  await fireEvent.press(screen.getByTestId('run-course-start'));
  const preparation=onStart.mock.calls[0][0];
  await view.rerender(<CourseRunPreparation id="course" busy onStart={onStart}/>);
  expect(screen.getByTestId('run-course-start')).toBeDisabled();
  expect(screen.getByTestId('run-course-start')).toHaveTextContent('러닝 시작 준비 중');
  await view.unmount();
  expect(mockRemove).toHaveBeenCalled();
  expect(preparation.read().fix).toBeNull();
});
