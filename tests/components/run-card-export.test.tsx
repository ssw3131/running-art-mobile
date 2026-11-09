import React from 'react';
import { Image as NativeImage } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import RunCardScreen from '../../src/app/run-card';

const mockCapture = jest.fn(), mockRetain = jest.fn(), mockShare = jest.fn(), mockRelease = jest.fn();
let mockOwner = 'owner';
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => ({ id: 'record' }), useFocusEffect: (effect: any) => require('react').useEffect(effect, [effect]) }));
jest.mock('../../src/features/auth/use-auth', () => ({ useAuth: () => ({ account: { id: mockOwner, name: '러너' } }) }));
jest.mock('../../src/modules/auth/runtime', () => ({ authentication: { getSnapshot: () => ({ account: { id: mockOwner } }) } }));
jest.mock('../../src/features/achievements/use-run-result', () => ({ useRunResult: () => ({ data: { run: { status: 'completed', startedAt: 0, activeMs: 60000, distanceM: 100 }, course: null, points: [] }, error: '', retry: jest.fn() }) }));
jest.mock('../../src/features/achievements/use-share-map',()=>({useShareMap:()=>({pending:false})}));
jest.mock('../../src/features/course-generation/use-point-address',()=>({usePointAddress:()=>({address:'',label:''})}));
jest.mock('../../src/features/account/use-profile-photo',()=>({useProfilePhoto:()=>null}));
jest.mock('../../src/features/achievements/ShareCard', () => ({ ShareCard: ({ onReady, onError }: any) => require('react').createElement(require('react-native').View, { testID: 'canvas', onReady, onError }) }));
jest.mock('../../src/features/achievements/AchievementImage', () => ({ AchievementImage: (props: any) => require('react').createElement(require('react-native').View, props) }));
jest.mock('../../src/features/running/RunSharePanel', () => () => null);
jest.mock('../../src/features/service/open-service-tab', () => ({ openServiceTab: jest.fn() }));
jest.mock('react-native-view-shot', () => ({ captureRef: (...args: any[]) => mockCapture(...args), releaseCapture: (...args: any[]) => mockRelease(...args) }));
jest.mock('../../src/modules/achievements/image-file', () => ({ retainCard: (...args: any[]) => mockRetain(...args), shareCardFile: (...args: any[]) => mockShare(...args), saveCardFile: jest.fn().mockResolvedValue('saved') }));

beforeEach(() => {
  mockOwner = 'owner'; mockCapture.mockReset().mockResolvedValue('file:///capture.png');
  mockRetain.mockReset().mockResolvedValue('file:///retained.png'); mockShare.mockReset().mockResolvedValue(undefined); mockRelease.mockReset();
  jest.spyOn(NativeImage, 'getSize').mockResolvedValue({ width: 1080, height: 1080 });
});
afterEach(() => jest.restoreAllMocks());

test('shows image preparation, retries a failed canvas, then shares the retained PNG', async () => {
  await render(<RunCardScreen/>);
  expect(screen.getByTestId('card-loading')).toBeTruthy();
  expect(screen.getByTestId('card-share')).toBeDisabled();
  const staleReady = screen.getByTestId('canvas').props.onReady;
  await fireEvent(screen.getByTestId('canvas'), 'error');
  await fireEvent.press(screen.getByText('카드 이미지 다시 불러오기'));
  await act(() => staleReady());
  expect(screen.getByTestId('card-share')).toBeDisabled();
  await fireEvent(screen.getByTestId('canvas'), 'ready');
  expect(screen.getByTestId('card-share')).toBeEnabled();
  await fireEvent.press(screen.getByTestId('card-share'));
  await waitFor(() => expect(mockShare).toHaveBeenCalledWith('file:///retained.png', expect.any(Function)));
  expect(mockCapture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ format: 'png', width: 1080, height: 1080 }));
  expect(mockRelease).toHaveBeenCalledWith('file:///capture.png');
  expect(screen.getByTestId('card-png-preview')).toBeTruthy();
});

test('a failed native share can retry the same PNG without recapturing', async () => {
  mockShare.mockRejectedValueOnce(new Error('no activity'));
  await render(<RunCardScreen/>); await fireEvent(screen.getByTestId('canvas'), 'ready');
  await fireEvent.press(screen.getByTestId('card-share'));
  await waitFor(() => expect(screen.getByTestId('card-message')).toHaveTextContent(/공유 창을 열지 못했어요/));
  await fireEvent.press(screen.getByTestId('card-share'));
  await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(2));
  expect(mockCapture).toHaveBeenCalledTimes(1);
});

test('capture failure is distinguished from sharing failure and does not send a file', async () => {
  mockCapture.mockRejectedValueOnce(new Error('view not ready'));
  await render(<RunCardScreen/>); await fireEvent(screen.getByTestId('canvas'), 'ready');
  await fireEvent.press(screen.getByTestId('card-share'));
  await waitFor(() => expect(screen.getByTestId('card-message')).toHaveTextContent(/카드 이미지를 만들지 못했어요/));
  expect(mockShare).not.toHaveBeenCalled(); expect(screen.getByTestId('card-share')).toBeEnabled();
});

test('account changes during capture prevent retention and external sharing', async () => {
  let finish!: (uri: string) => void;
  mockCapture.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = await render(<RunCardScreen/>); await fireEvent(screen.getByTestId('canvas'), 'ready');
  await fireEvent.press(screen.getByTestId('card-share'));
  await waitFor(() => expect(mockCapture).toHaveBeenCalledTimes(1));
  mockOwner = 'different-owner'; await view.rerender(<RunCardScreen/>);
  await act(async () => finish('file:///capture.png'));
  expect(mockRetain).not.toHaveBeenCalled(); expect(mockShare).not.toHaveBeenCalled();
  expect(mockRelease).toHaveBeenCalledWith('file:///capture.png');
});

test('platform selection prepares square and story exports separately and link mode has no image action', async()=>{
 await render(<RunCardScreen/>);
 expect(screen.getByTestId('share-platform-instagram').props.accessibilityState.selected).toBe(true);
 await fireEvent.press(screen.getByTestId('share-platform-story'));
 expect(screen.queryByTestId('card-share')).toBeNull();
 expect(screen.getByTestId('card-story')).toBeDisabled();
 jest.mocked(NativeImage.getSize).mockResolvedValue({width:1080,height:1920});
 await fireEvent(screen.getByTestId('canvas'),'ready');
 await fireEvent.press(screen.getByTestId('card-story'));
 await waitFor(()=>expect(mockCapture).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({width:1080,height:1920})));
 await waitFor(()=>expect(mockShare).toHaveBeenCalledTimes(1));
 await fireEvent.press(screen.getByTestId('share-platform-link'));
 expect(screen.getByTestId('share-link-preview')).toBeTruthy();
 expect(screen.queryByTestId('card-story')).toBeNull();
 expect(mockShare).toHaveBeenCalledTimes(1);
});

test('saving has explicit square/story choices and retains the selected ratio on return',async()=>{
 await render(<RunCardScreen/>);
 await fireEvent.press(screen.getByTestId('share-platform-save'));
 expect(screen.getByTestId('card-format-square').props.accessibilityState.checked).toBe(true);
 await fireEvent.press(screen.getByTestId('card-format-story'));
 expect(screen.getByTestId('card-format-story').props.accessibilityState.checked).toBe(true);
 await fireEvent.press(screen.getByTestId('share-platform-instagram'));
 await fireEvent.press(screen.getByTestId('share-platform-save'));
 expect(screen.getByTestId('card-format-story').props.accessibilityState.checked).toBe(true);
 expect(screen.getByTestId('card-save')).toBeDisabled();
});
