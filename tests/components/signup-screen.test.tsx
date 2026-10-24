import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import SignupScreen from '../../src/features/membership/SignupScreen';

const mockAuth = { ready: true, busy: false, message: '', account: { id: 'owner-a', name: '기존 이름', picture: 'provider', email: '', avatarUrl: null } };
const mockPolicy = { id: 'qa-v1', terms: 'QA terms', privacy: 'QA privacy', publishedAt: '2026-10-13T00:00:00Z' };
let mockState: any;
let mockBlur: (() => void) | undefined;
const mockPrepare = jest.fn(), mockRetryPolicy = jest.fn(), mockSignOut = jest.fn(), mockReload = jest.fn(), mockSaveProfile = jest.fn(), mockAccept = jest.fn(), mockPick = jest.fn(), mockDiscard = jest.fn();
jest.mock('../../src/features/auth/use-auth', () => ({ useAuth: () => mockAuth }));
jest.mock('../../src/features/membership/use-membership', () => ({ useMembership: () => mockState }));
jest.mock('../../src/modules/auth/runtime', () => ({ profilePhotosEnabled: true, authentication: { getSnapshot: () => mockAuth, signOut: () => mockSignOut(), saveProfile: (...args: any[]) => mockSaveProfile(...args) } }));
jest.mock('../../src/modules/membership/runtime', () => ({ membership: { reload: () => mockReload(), retryPolicy: () => mockRetryPolicy(), accept: (...args: any[]) => mockAccept(...args) } }));
jest.mock('../../src/features/account/use-profile-photo', () => ({ useProfilePhoto: () => null }));
jest.mock('../../src/modules/account/photo-picker', () => ({ pickProfilePhoto: () => mockPick(), discardProfilePhoto: (...args: any[]) => mockDiscard(...args) }));
jest.mock('../../src/features/membership/profile-presets', () => ({ presetSource: 1, presetSlots: [[7.5, 15.75], [72, 15.75]], prepareSignupPreset: (index: number) => mockPrepare(index) }));
jest.mock('../../src/features/service/open-service-tab', () => ({ openServiceTab: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useFocusEffect: (effect: any) => {
  require('react').useEffect(() => { mockBlur = effect(); return mockBlur; }, [effect]);
} }));

beforeEach(() => { mockState = { owner: 'owner-a', status: 'loading', policy: null, policyStatus: 'unavailable', message: '', busy: false }; });

test('UI-SIGNUP-04: loading, unavailable and error stay incomplete; explicit retry and confirmed completion', async () => {
  const view = await render(<SignupScreen />);
  expect(screen.getByLabelText('가입 상태 확인 중')).toBeVisible();
  for (const status of ['unavailable', 'error']) {
    mockState = { ...mockState, status, message: '아직 완료되지 않았어요.' };
    await view.rerender(<SignupScreen />);
    expect(screen.queryByTestId('signup-done')).toBeNull();
    await fireEvent.press(screen.getByText('가입 상태 다시 확인'));
  }
  expect(mockReload).toHaveBeenCalledTimes(2);
  mockState = { ...mockState, status: 'complete' };
  await view.rerender(<SignupScreen />);
  expect(screen.getByTestId('signup-done')).toBeVisible();
});

test('UI-SIGNUP-05: leaving during photo preparation discards the late result and clears busy state', async () => {
  mockState = { ...mockState, status: 'required', policy: mockPolicy, policyStatus: 'ready' };
  let finish!: (value: any) => void;
  mockPick.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(<SignupScreen />);
  await fireEvent.press(screen.getByTestId('signup-consent-all'));
  await fireEvent.press(screen.getByTestId('signup-photo'));
  expect(screen.getByTestId('signup-complete')).toBeDisabled();
  const latePhoto = { uri: 'file:///synthetic.jpg' };
  await act(async () => { mockBlur?.(); finish(latePhoto); });
  expect(mockDiscard).toHaveBeenCalledWith(latePhoto);
  expect(screen.getByTestId('signup-complete')).toBeEnabled();
  expect(mockSaveProfile).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
});


test('policy failure preserves editable profile, explicit retry and logout while completion stays blocked', async () => {
  mockState = { ...mockState, status: 'required', policyStatus: 'error' };
  const view = await render(<SignupScreen />);
  await fireEvent.changeText(screen.getByTestId('signup-nickname'), '입력 보존');
  expect(screen.getByTestId('signup-complete')).toBeDisabled();
  await fireEvent.press(screen.getByText('약관 다시 확인')); expect(mockRetryPolicy).toHaveBeenCalledTimes(1);
  mockState = { ...mockState, policyStatus: 'ready', policy: mockPolicy };
  await view.rerender(<SignupScreen />);
  expect(screen.getByTestId('signup-nickname').props.value).toBe('입력 보존');
  expect(screen.getByTestId('signup-complete')).toBeDisabled();
  await fireEvent.press(screen.getByText('로그아웃')); expect(mockSignOut).toHaveBeenCalledTimes(1);
});
test('default avatar selection and nickname clear are explicit and photo cancellation preserves them', async () => {
  mockState = { ...mockState, status: 'required', policy: mockPolicy, policyStatus: 'ready' };
  mockPick.mockResolvedValue(null);
  await render(<SignupScreen />);
  await fireEvent.press(screen.getByTestId('signup-nickname-clear'));
  expect(screen.getByTestId('signup-nickname').props.value).toBe('');
  await fireEvent.press(screen.getByTestId('signup-default-photo'));
  expect(screen.getByTestId('signup-default-photo').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByTestId('signup-photo'));
  expect(screen.getByTestId('signup-default-photo').props.accessibilityState.selected).toBe(true);
});

test('provider photo occupies the first original Figma slot, with no extra provider link', async () => {
  mockState = { ...mockState, status: 'required', policy: mockPolicy, policyStatus: 'ready' };
  const account = mockAuth.account as any;
  account.avatarUrl = 'https://example.invalid/provider.jpg';
  try {
    await render(<SignupScreen />);
    expect(screen.getByTestId('signup-default-photo').props.accessibilityLabel).toBe('연결 계정 사진 사용');
    expect(screen.getByTestId('signup-default-photo').props.accessibilityState.selected).toBe(true);
    expect(screen.queryByText('연결 계정 사진 사용')).toBeNull();
  } finally { account.avatarUrl = null; }
});


test('preset selection marks only the prepared choice and profile save precedes consent', async () => {
  mockState = { ...mockState, status: 'required', policy: mockPolicy, policyStatus: 'ready' };
  const photo = { uri: 'file:///preset.jpg' };
  mockPrepare.mockResolvedValue(photo);
  mockSaveProfile.mockResolvedValue(false);
  mockAccept.mockImplementation(async (_input: unknown, save: () => Promise<boolean>) => save());
  await render(<SignupScreen />);
  await fireEvent.press(screen.getByTestId('signup-preset-1'));
  expect(mockPrepare).toHaveBeenCalledWith(1);
  expect(screen.getByTestId('signup-preset-1').props.accessibilityState.selected).toBe(true);
  expect(screen.getByTestId('signup-preset-0').props.accessibilityState.selected).toBe(false);
  await fireEvent.press(screen.getByTestId('signup-consent-all'));
  await fireEvent.press(screen.getByTestId('signup-complete'));
  expect(mockSaveProfile).toHaveBeenCalledWith({ nickname: '기존 이름', picture: 'uploaded' }, photo);
  expect(screen.getByTestId('signup-nickname').props.value).toBe('기존 이름');
  expect(screen.getByTestId('signup-preset-1').props.accessibilityState.selected).toBe(true);
});
