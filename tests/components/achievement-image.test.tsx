import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AchievementImage } from '../../src/features/achievements/AchievementImage';
const mockReload = jest.fn();
jest.mock('expo-image', () => {
  const React = require('react'), { View } = require('react-native');
  return { Image: React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ reloadAsync: mockReload }));
    return React.createElement(View, { ...props, testID: 'asset' });
  }) };
});
beforeEach(() => { jest.useFakeTimers(); mockReload.mockReset().mockResolvedValue(undefined); });
afterEach(() => jest.useRealTimers());

test('retries native asset loading twice, then reports a persistent failure', async () => {
  const error = jest.fn(); await render(<AchievementImage source={1} onError={error}/>);
  await fireEvent(screen.getByTestId('asset'), 'error', { error: 'network' });
  await act(() => jest.advanceTimersByTime(250));
  expect(mockReload).toHaveBeenCalledTimes(1); expect(error).not.toHaveBeenCalled();
  await fireEvent(screen.getByTestId('asset'), 'error', { error: 'network' });
  await act(() => jest.advanceTimersByTime(500));
  expect(mockReload).toHaveBeenCalledTimes(2);
  await fireEvent(screen.getByTestId('asset'), 'error', { error: 'network' });
  expect(error).toHaveBeenCalledTimes(1);
});

test('unmount cancels a scheduled asset retry', async () => {
  const view = await render(<AchievementImage source={1}/>);
  await fireEvent(screen.getByTestId('asset'), 'error', { error: 'network' });
  await view.unmount(); await act(() => jest.advanceTimersByTime(1000));
  expect(mockReload).not.toHaveBeenCalled();
});
