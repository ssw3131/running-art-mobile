import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ShareCard } from '../../src/features/achievements/ShareCard';

jest.mock('../../src/features/achievements/AchievementImage', () => ({ AchievementImage: (props: any) => require('react').createElement(require('react-native').View, { ...props, testID: 'card-image' }) }));
const content = { title: '하트 코스', outcome: '완주를 축하합니다.', nickname: '러너', date: '2026년 11월 8일', pathLabel: '계획 코스 윤곽', pathUri: 'data:image/svg+xml;base64,test', distance: '3.00 km', duration: '00:18:00', pace: '6:00' };
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('waits for display, not merely image download, and reports ready only once', async () => {
  const ready = jest.fn(), error = jest.fn();
  const view = await render(<ShareCard content={content} format="card" canvasRef={null} onReady={ready} onError={error}/>);
  await fireEvent(view.root, 'layout', {});
  for (const image of screen.getAllByTestId('card-image')) await fireEvent(image, 'load', {});
  expect(ready).not.toHaveBeenCalled();
  for (const image of screen.getAllByTestId('card-image')) await fireEvent(image, 'display');
  expect(ready).toHaveBeenCalledTimes(1);
  await fireEvent(screen.getAllByTestId('card-image')[0], 'display');
  await act(() => jest.advanceTimersByTime(15000));
  expect(ready).toHaveBeenCalledTimes(1); expect(error).not.toHaveBeenCalled();
});

test('a failed/late asset cannot enable capture; a remount retries every asset', async () => {
  const ready = jest.fn(), error = jest.fn();
  const view = await render(<ShareCard key="first" content={content} format="card" canvasRef={null} onReady={ready} onError={error}/>);
  await fireEvent(view.root, 'layout', {});
  await fireEvent(screen.getAllByTestId('card-image')[0], 'error', {});
  for (const image of screen.getAllByTestId('card-image')) await fireEvent(image, 'display');
  expect(error).toHaveBeenCalledTimes(1); expect(ready).not.toHaveBeenCalled();
  await view.rerender(<ShareCard key="retry" content={content} format="card" canvasRef={null} onReady={ready} onError={error}/>);
  await fireEvent(view.root, 'layout', {});
  for (const image of screen.getAllByTestId('card-image')) await fireEvent(image, 'display');
  expect(ready).toHaveBeenCalledTimes(1);
});

test('an asset that never responds exposes retry instead of leaving sharing locked forever', async () => {
  const error = jest.fn();
  await render(<ShareCard content={content} format="story" canvasRef={null} onReady={jest.fn()} onError={error}/>);
  await act(() => jest.advanceTimersByTime(15000));
  expect(error).toHaveBeenCalledTimes(1);
});
