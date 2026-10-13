jest.mock('../../src/features/auth/use-auth', () => ({ useAuth: () => ({ready:true,account:null}) }));
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import RunsScreen from '../../src/features/running/RunsScreen';
import { getStorage } from '../../src/modules/storage/database';
jest.mock('../../src/modules/storage/database', () => ({ getStorage: jest.fn() }));
jest.mock('../../src/features/service/ServiceTabLink', () => {
  const React = require('react'), { Text } = require('react-native');
  return { ServiceTabLink: ({ children }: any) => React.createElement(Text, null, children) };
});

test('UI-RUNS-01: pending list does not claim empty; completion shows empty state', async () => {
  let finish!: (value: any[]) => void;
  const list = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  jest.mocked(getStorage).mockResolvedValue({ runs: { list } } as any);
  await render(<RunsScreen embedded />);
  expect(screen.queryByTestId('runs-empty')).toBeNull();
  expect(screen.getByTestId('runs-refresh')).toBeDisabled();
  await act(async () => finish([]));
  expect(screen.getByTestId('runs-empty')).toBeVisible();
  expect(screen.getByTestId('runs-refresh')).toBeEnabled();
});

test('UI-RUNS-02: storage failure is announced and refresh recovers', async () => {
  const list = jest.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([]);
  jest.mocked(getStorage).mockResolvedValue({ runs: { list } } as any);
  await render(<RunsScreen embedded />);
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.queryByTestId('runs-empty')).toBeNull();
  await fireEvent.press(screen.getByTestId('runs-refresh'));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByTestId('runs-empty')).toBeVisible();
});
