import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ConsentForm } from '../../src/features/membership/ConsentForm';

const policy = { id: 'qa-v1', terms: '실제 표시할 검증용 이용약관 본문', privacy: '실제 표시할 검증용 개인정보 본문', publishedAt: '2026-10-13T00:00:00Z' };
const props = () => ({ policy, email: '', nickname: '러너', onNickname: jest.fn(), busy: false, message: '', profile: null, onSubmit: jest.fn() });

test('UI-SIGNUP-01: both required consents enable completion; marketing is absent and email is optional', async () => {
  const p = props(); await render(<ConsentForm {...p} />);
  expect(screen.getByText('이메일 정보가 없는 계정')).toBeVisible();
  expect(screen.getByTestId('signup-complete')).toBeDisabled();
  expect(screen.queryByText(/마케팅/)).toBeNull();
  await fireEvent.press(screen.getByTestId('signup-consent-terms'));
  expect(screen.getByTestId('signup-complete')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('signup-consent-privacy'));
  expect(screen.getByTestId('signup-complete')).toBeEnabled();
  await fireEvent.press(screen.getByTestId('signup-complete')); expect(p.onSubmit).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByTestId('signup-consent-all'));
  expect(screen.getByTestId('signup-complete')).toBeDisabled();
});
test('UI-SIGNUP-02: policy viewer shows exact version and does not opt in on close', async () => {
  await render(<ConsentForm {...props()} />);
  await fireEvent.press(screen.getByTestId('signup-read-privacy'));
  expect(screen.getByText(policy.privacy)).toBeVisible();
  expect(screen.getByText('버전 qa-v1')).toBeVisible();
  await fireEvent.press(screen.getByText('닫기'));
  expect(screen.getByTestId('signup-complete')).toBeDisabled();
});
test('UI-SIGNUP-03: submit locks input and choices; retry retains choices; new version resets consent', async () => {
  const p = props(); const view = await render(<ConsentForm key={policy.id} {...p} />);
  await fireEvent.press(screen.getByTestId('signup-consent-all'));
  await view.rerender(<ConsentForm key={policy.id} {...p} busy />);
  expect(screen.getByTestId('signup-complete')).toBeDisabled();
  expect(screen.getByTestId('signup-consent-all')).toBeDisabled();
  expect(screen.getByTestId('signup-nickname')).toBeDisabled();
  await view.rerender(<ConsentForm key={policy.id} {...p} message="다시 시도해 주세요." />);
  expect(screen.getByTestId('signup-complete')).toBeEnabled();
  expect(screen.getByText('다시 시도해 주세요.')).toBeVisible();
  await view.rerender(<ConsentForm key="qa-v2" {...p} policy={{ ...policy, id: 'qa-v2' }} />);
  expect(screen.getByTestId('signup-complete')).toBeDisabled();
});
