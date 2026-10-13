import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import SignupScreen from '../../src/features/membership/SignupScreen';

const mockAuth = { ready: true, busy: false, message: '', account: { id: 'owner-a', name: '기존 이름', picture: 'provider', email: '', avatarUrl: null } };
const mockPolicy = { id: 'qa-v1', terms: 'QA terms', privacy: 'QA privacy', publishedAt: '2026-10-13T00:00:00Z' };
let mockState: any;
let mockBlur: (() => void) | undefined;
const mockReload = jest.fn(), mockSaveProfile = jest.fn(), mockAccept = jest.fn(), mockPick = jest.fn(), mockDiscard = jest.fn();
jest.mock('../../src/features/auth/use-auth', () => ({ useAuth: () => mockAuth }));
jest.mock('../../src/features/membership/use-membership', () => ({ useMembership: () => mockState }));
jest.mock('../../src/modules/auth/runtime', () => ({ profilePhotosEnabled: true, authentication: { getSnapshot: () => mockAuth, saveProfile: (...args: any[]) => mockSaveProfile(...args) } }));
jest.mock('../../src/modules/membership/runtime', () => ({ membership: { reload: () => mockReload(), accept: (...args: any[]) => mockAccept(...args) } }));
jest.mock('../../src/features/account/use-profile-photo', () => ({ useProfilePhoto: () => null }));
jest.mock('../../src/modules/account/photo-picker', () => ({ pickProfilePhoto: () => mockPick(), discardProfilePhoto: (...args: any[]) => mockDiscard(...args) }));
jest.mock('../../src/features/membership/profile-presets', () => ({ presetSource: 1, presetSlots: [], prepareSignupPreset: jest.fn() }));
jest.mock('../../src/features/service/open-service-tab', () => ({ openServiceTab: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useFocusEffect: (effect: any) => {
  require('react').useEffect(() => { mockBlur = effect(); return mockBlur; }, [effect]);
} }));

beforeEach(() => { mockState = { owner: 'owner-a', status: 'loading', policy: null, message: '', busy: false }; });

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
  mockState = { ...mockState, status: 'required', policy: mockPolicy };
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
