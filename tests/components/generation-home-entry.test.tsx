import { act, renderHook } from '@testing-library/react-native';
import { useCourseGeneration } from '../../src/features/course-generation/use-course-generation';

let mockParams: Record<string, string> = {};
const mockJobs = { cancel: jest.fn(), start: jest.fn() };
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: any) => require('react').useEffect(effect, [effect]) }));
jest.mock('../../src/features/route-lab/session', () => ({ createLabSession: () => mockJobs }));
jest.mock('../../src/features/route-lab/scheduler', () => ({ calculateMobileRoute: jest.fn() }));
jest.mock('../../src/modules/road-data/mobile-loader', () => ({ loadMobileRoads: jest.fn() }));
jest.mock('../../src/modules/route-compute/mobile', () => ({ calculateServerRoute: jest.fn() }));
jest.mock('../../src/modules/location/expo-provider', () => ({ expoLocationProvider: {} }));
jest.mock('../../src/modules/auth/runtime', () => ({ authentication: { getSnapshot: () => ({ account: { id: 'owner' } }) } }));
jest.mock('../../src/modules/storage/database', () => ({ getStorage: async () => ({ usageJobs: { read: async () => null } }) }));
jest.mock('../../src/features/course-generation/course-location-memory', () => ({
  getRememberedCourseCenter: (origin: any) => origin, rememberCourseCenter: jest.fn(),
  shouldLocateCourseOnEntry: () => false, markCourseEntryLocationAttempted: jest.fn(),
}));

beforeEach(() => { mockParams = {}; mockJobs.cancel.mockReset(); mockJobs.start.mockReset(); });

test('home conditions request preserves the completed route, shape and distance without computing again', async () => {
  const { result, rerender } = await renderHook(() => useCourseGeneration());
  await act(() => { result.current.setShape('star'); result.current.setTargetKm(7); });
  mockJobs.start.mockImplementation((_request: any, events: any) => events.success({
    result: { candidates: [] }, origin: { lat: 37, lng: 127 }, options: { shape: 'star', targetKm: 7 },
    timing: { totalMs: 10 }, execution: 'server',
  }));
  await act(() => result.current.start({ origin: { lat: 37, lng: 127 }, shape: 'star', targetKm: 7 }));
  const previous = result.current.completed;
  expect(result.current.tab).toBe('results');
  mockParams = { homeSection: 'conditions', homeRequest: 'next-search' };
  await rerender({});
  expect(result.current.tab).toBe('conditions');
  expect(result.current.completed).toBe(previous);
  expect(result.current.shape).toBe('star');
  expect(result.current.targetKm).toBe(7);
  expect(mockJobs.start).toHaveBeenCalledTimes(1);
  await act(() => result.current.setTab('results'));
  await rerender({});
  expect(result.current.tab).toBe('results');
});
