import React from 'react';
import { act, render } from '@testing-library/react-native';
import AuthCallbackScreen from '../../src/app/auth/callback';
const mockReplace = jest.fn(), mockNavigate = jest.fn(), mockDismiss = jest.fn(), mockHandle = jest.fn(), mockStart = jest.fn();
let mockAccount: any, mockURL: string | null;
let mockRequired = false;
const mockMembershipReload = jest.fn();
jest.mock('../../src/modules/membership/runtime', () => ({ membership: {
  reload: () => mockMembershipReload(), getSnapshot: () => ({ owner: mockAccount?.id, status: mockRequired ? 'required' : 'complete',
    policyStatus: 'ready', policy: { id: 'v1' }, membership: { owner: mockAccount?.id, policyId: 'v1', completedAt: '2026-10-24' }, busy: false }),
} }));
jest.mock('expo-router', () => ({ router: { replace: (...args: any[]) => mockReplace(...args), navigate: (...args: any[]) => mockNavigate(...args), dismissAll: () => mockDismiss() } }));
jest.mock('expo-linking', () => ({ useLinkingURL: () => mockURL }));
jest.mock('../../src/modules/auth/runtime', () => ({ authentication: {
  start: () => mockStart(), handleUrl: (url: string) => mockHandle(url), getSnapshot: () => ({ account: mockAccount }),
} }));
beforeEach(() => { mockRequired = false; mockMembershipReload.mockReset().mockResolvedValue(undefined); mockAccount = null; mockURL = 'runningart://auth/callback?code=fixture-code'; mockReplace.mockReset(); mockNavigate.mockReset(); mockDismiss.mockReset(); mockHandle.mockReset(); mockStart.mockReset().mockResolvedValue(undefined); });
test('callback waits for the common exchange and then opens home on success', async () => {
  let finish!: () => void;
  mockHandle.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await render(<AuthCallbackScreen />);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  await act(async () => { mockAccount = { id: 'A' }; finish(); });
  expect(mockHandle).toHaveBeenCalledWith('runningart://auth/callback?code=fixture-code');
  expect(mockDismiss).toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('/');
  expect(mockReplace).not.toHaveBeenCalled();
});
test.each(['cancel', 'error'])('callback %s returns to entry, never a service tab', async outcome => {
  mockURL = 'runningart://auth/callback?error=access_denied';
  mockHandle.mockImplementation(async () => { if (outcome === 'error') throw Error('fixture error'); });
  await render(<AuthCallbackScreen />);
  expect(mockReplace).toHaveBeenCalledWith('/account-entry');
});

test('passes the original URL to validation without normalizing invalid parameters or fragments', async () => {
  mockURL = 'runningart://auth/callback?code=one&code=two#access_token=invalid-fixture';
  await render(<AuthCallbackScreen />);
  expect(mockHandle).toHaveBeenCalledWith(mockURL);
  expect(mockReplace).toHaveBeenCalledWith('/account-entry');
});

test('does not navigate after the callback screen unmounts', async () => {
  let finish!: () => void;
  mockHandle.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const screen = await render(<AuthCallbackScreen />);
  await screen.unmount();
  await act(async () => { finish(); });
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});


test('pending social account goes to signup after membership lookup, never home', async () => {
  mockRequired = true;
  mockHandle.mockImplementation(async () => { mockAccount = { id: 'new-owner' }; });
  await render(<AuthCallbackScreen />);
  expect(mockMembershipReload).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/account-signup');
  expect(mockNavigate).not.toHaveBeenCalled();
});
