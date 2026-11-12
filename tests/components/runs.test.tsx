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
  jest.mocked(getStorage).mockResolvedValue({ runs: { finished: list } } as any);
  await render(<RunsScreen embedded />);
  expect(screen.queryByTestId('runs-empty')).toBeNull();
  expect(screen.queryByTestId('runs-refresh')).toBeNull();
  await act(async () => finish([]));
  expect(screen.getByTestId('runs-empty')).toBeVisible();
  expect(screen.queryByTestId('runs-refresh')).toBeNull();
});

test('UI-RUNS-02: storage failure is announced and refresh recovers', async () => {
  const list = jest.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([]);
  jest.mocked(getStorage).mockResolvedValue({ runs: { finished: list } } as any);
  await render(<RunsScreen embedded />);
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.queryByTestId('runs-empty')).toBeNull();
  await fireEvent.press(screen.getByText('다시 불러오기'));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByTestId('runs-empty')).toBeVisible();
});

test('finished list shows estimated time and finish date, without simulation labels',async()=>{
 const endedAt=new Date(2026,10,12,1,0).getTime();
 jest.mocked(getStorage).mockResolvedValue({runs:{finished:async()=>[{id:'finished',status:'completed',courseId:'course',courseOutcome:'finished',shape:'heart',courseName:'하트',distanceM:5000,activeMs:1000,startedAt:endedAt-7200000,endedAt,reason:'simulation'}]}} as any);
 await render(<RunsScreen embedded/>);
 expect(screen.getByLabelText('거리와 예상 러닝 시간')).toHaveTextContent(/5\.0 km.*00:33:00/);
 expect(screen.getByText('2026/11/12')).toBeVisible();
 expect(screen.queryByText('시뮬레이션')).toBeNull();
});
