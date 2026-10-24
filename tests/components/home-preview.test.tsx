import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { HomePreview } from '../../src/features/service/HomePreview';
jest.mock('../../src/modules/map/config', () => ({ mapStyleUrl: () => 'https://map.invalid/style.json', themedMapStyle: (url: string) => url }));
jest.mock('@maplibre/maplibre-react-native', () => {
  const { View } = require('react-native');
  return { Map: View, Camera: () => null, GeoJSONSource: View, Layer: () => null };
});
const paths: [number, number][][] = [[[127, 37], [127.01, 37.01]], [[127.02, 37.02], [127.03, 37.03]]];
beforeEach(() => { jest.useFakeTimers(); AppState.currentState = 'active'; });
afterEach(() => jest.useRealTimers());
test('only visible previews mount a map; load failure retains trace and attribution', async () => {
  const view = await render(<HomePreview paths={paths} active={false} label="경로" />);
  expect(screen.queryByTestId('home-preview-map')).toBeNull();
  await view.rerender(<HomePreview paths={paths} active label="경로" />);
  const map = screen.getByTestId('home-preview-map');
  expect(map.props.dragPan).toBe(false); expect(map.props.touchZoom).toBe(false);
  await fireEvent(map, 'didFailLoadingMap');
  expect(screen.queryByTestId('home-preview-map')).toBeNull();
  expect(screen.getByText('© MapTiler © OSM')).toBeVisible();
  expect(screen.queryByText('경로 기록이 없어요')).toBeNull();
});
test('stalled map times out to local trace; a new path can load again', async () => {
  const view = await render(<HomePreview paths={paths} active label="경로" />);
  await act(async () => jest.advanceTimersByTime(12000));
  expect(screen.queryByTestId('home-preview-map')).toBeNull();
  await view.rerender(<HomePreview paths={[paths[0]]} active label="경로" />);
  expect(screen.getByTestId('home-preview-map')).toBeVisible();
  await view.rerender(<HomePreview paths={[paths[0]]} active={false} label="경로" />);
  expect(screen.queryByTestId('home-preview-map')).toBeNull();
});
