import { act, renderHook } from '@testing-library/react-native';
import { usePointAddress } from '../../src/features/course-generation/use-point-address';
import { reverseGeocode } from '../../src/modules/map/place-search';
jest.mock('../../src/modules/map/place-search', () => ({ reverseGeocode: jest.fn() }));
jest.mock('expo-router', () => ({ useFocusEffect: (fn: any) => require('react').useEffect(fn, [fn]) }));
beforeEach(() => { jest.useFakeTimers(); jest.mocked(reverseGeocode).mockReset(); });
afterEach(() => jest.useRealTimers());
test('a late old address cannot overwrite a newer point', async () => {
  const resolve: ((address: string) => void)[] = [];
  jest.mocked(reverseGeocode).mockImplementation(() => new Promise(done => resolve.push(done)));
  const hook = await renderHook(({ lat }) => usePointAddress({ lat, lng: 127 }), { initialProps: { lat: 37 } });
  await act(() => jest.advanceTimersByTime(350));
  const signal = jest.mocked(reverseGeocode).mock.calls[0][2];
  await hook.rerender({ lat: 37.1 }); expect(signal.aborted).toBe(true);
  await act(() => jest.advanceTimersByTime(350));
  await act(async () => resolve[1]('새 주소'));
  expect(hook.result.current.address).toBe('새 주소');
  await act(async () => resolve[0]('이전 주소'));
  expect(hook.result.current.address).toBe('새 주소');
});
test('selected search address is shown immediately without another lookup', async () => {
  const hook = await renderHook(() => usePointAddress({ lat: 37, lng: 127 }, '검색한 주소'));
  await act(() => jest.advanceTimersByTime(400));
  expect(hook.result.current.label).toBe('검색한 주소'); expect(reverseGeocode).not.toHaveBeenCalled();
});
