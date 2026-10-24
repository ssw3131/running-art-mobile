import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import HomeScreen from '../../src/features/service/HomeScreen';

let mockAuth: any;
const mockRead = jest.fn(), mockNavigate = jest.fn(), mockPush = jest.fn();
jest.mock('../../src/features/auth/use-auth', () => ({ useAuth: () => mockAuth }));
jest.mock('../../src/modules/storage/database', () => ({ getStorage: async () => ({ home: { read: () => mockRead() } }) }));
jest.mock('expo-router', () => ({ router: { navigate: (...args: any[]) => mockNavigate(...args), push: (...args: any[]) => mockPush(...args) },
  useFocusEffect: (effect: any) => require('react').useEffect(effect, [effect]) }));
jest.mock('../../src/features/service/HomePreview', () => ({ HomePreview: () => null }));
const data = (owner = 'A') => ({ owner, monthStart: 0, monthEnd: 1, monthlyDistanceM: 3200, runCount: 0, currentStreak: 0, latestCompleted: null, courseCount: 0, courses: [], recent: [] });
const run = { id: 'a'.repeat(32), status: 'completed', distanceM: 3200, activeMs: 100000, startedAt: 1000, courseName: null };
beforeEach(() => { jest.useFakeTimers(); mockAuth = { ready: true, account: { id: 'A', name: '러너' } }; mockRead.mockReset(); mockNavigate.mockReset(); mockPush.mockReset(); AppState.currentState = 'active'; });
afterEach(() => { jest.useRealTimers(); });

test('UI-HOME-01: loading/error are distinct from initial, explicit retry shows empty home', async () => {
  let reject!: (error: Error) => void;
  mockRead.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })).mockResolvedValue(data());
  await render(<HomeScreen />);
  expect(screen.getByTestId('home-loading')).toBeVisible(); expect(screen.queryByTestId('home-initial')).toBeNull();
  await act(async () => reject(new Error('disk')));
  expect(screen.getByTestId('home-error')).toBeVisible(); expect(screen.queryByTestId('home-initial')).toBeNull();
  await fireEvent.press(screen.getByTestId('home-retry'));
  expect(screen.getByTestId('home-initial')).toBeVisible();
  await fireEvent.press(screen.getByTestId('home-shape-fish'));
  await fireEvent.press(screen.getByTestId('open-route-lab'));
  expect(mockNavigate.mock.lastCall?.[0]).toMatchObject({ pathname: '/route-lab', params: { homeShape: 'fish' } });
  expect(screen.getByTestId('home-shape-dog')).toBeEnabled();
  await fireEvent.press(screen.getByTestId('home-shape-dog'));await fireEvent.press(screen.getByTestId('open-route-lab'));
  expect(mockNavigate.mock.lastCall?.[0]).toMatchObject({pathname:'/route-lab',params:{homeShape:'dog'}});
});

test('UI-HOME-02: unfinished stays in history and opens the existing run without resuming', async () => {
  mockRead.mockResolvedValue({ ...data(), runCount: 1, recent: [{ run: { ...run, status: 'interrupted', courseId: 'course', courseName: '하트' }, paths: [] }] });
  await render(<HomeScreen />);
  expect(screen.getByTestId('home-history')).toBeVisible(); expect(screen.queryByTestId('home-active')).toBeNull();
  expect(screen.getByTestId('home-outcome-' + run.id)).toHaveTextContent('미완주');
  await fireEvent.press(screen.getByTestId('home-run-' + run.id)); expect(mockPush).toHaveBeenCalledWith({pathname:'/courses/[id]',params:{id:'course',runId:run.id}});
});

test('UI-HOME-03: history opens the real record and matching archive, without guest entry', async () => {
  mockRead.mockResolvedValue({ ...data(), runCount: 1, recent: [{ run, paths: [] }] });
  await render(<HomeScreen />);
  expect(screen.getByTestId('home-history')).toBeVisible(); expect(screen.queryByText('12일')).toBeNull();
  await fireEvent.press(screen.getByTestId('home-run-' + run.id));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/runs/[id]', params: { id: run.id } });
  await fireEvent.press(screen.getByTestId('home-more-runs'));
  expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/courses', params: { view: 'courses', fromHome: '1' } });
  expect(screen.queryByTestId('home-signup')).toBeNull();
});

test('UI-HOME-04: account switch hides old history immediately and discards its late response', async () => {
  let finishA!: (value: any) => void, finishB!: (value: any) => void;
  mockAuth = { ready: true, account: { id: 'A', name: '이전' } };
  mockRead.mockResolvedValueOnce({ ...data('A'), runCount: 1, recent: [{ run, paths: [] }] })
    .mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishB = resolve; }));
  const view = await render(<HomeScreen />); expect(screen.getByTestId('home-history')).toBeVisible();
  await act(async () => jest.advanceTimersByTime(2000));
  mockAuth = { ready: true, account: { id: 'B', name: '현재' } };
  await view.rerender(<HomeScreen />);
  expect(screen.queryByTestId('home-history')).toBeNull(); expect(screen.getByTestId('home-loading')).toBeVisible();
  await act(async () => finishA({ ...data('A'), runCount: 1, recent: [{ run, paths: [] }] }));
  expect(screen.queryByTestId('home-history')).toBeNull();
  await act(async () => finishB(data('B')));
  expect(screen.getByTestId('home-initial')).toBeVisible(); expect(screen.queryByTestId('home-signup')).toBeNull();
});

test('UI-HOME-05: authentication loading never reads guest storage or advertises an empty home', async () => {
  mockAuth = { ready: false, account: null }; await render(<HomeScreen />);
  expect(mockRead).not.toHaveBeenCalled(); expect(screen.getByTestId('home-loading')).toBeVisible();
  expect(screen.queryByTestId('home-initial')).toBeNull(); expect(screen.queryByTestId('home-signup')).toBeNull();
});

test('saved-only home shows zero run statistics and opens the saved course without invented activity time', async () => {
  const course = { id: 'b'.repeat(32), name: '저장한 하트', lengthKm: 3, createdAt: 1000, source: 'osm' };
  mockRead.mockResolvedValue({ ...data(), monthlyDistanceM: 0, courseCount: 1, courses: [{ course, paths: [] }] });
  await render(<HomeScreen />);
  expect(screen.getByTestId('home-stat-latest')).toHaveTextContent(/—/);
  expect(screen.getByTestId('home-stat-streak')).toHaveTextContent(/0 일/);
  expect(screen.getByTestId('home-stat-monthly')).toHaveTextContent(/0 km/);
  expect(screen.getByTestId('home-empty-runs')).toBeVisible();
  await fireEvent.press(screen.getByTestId('home-course-' + course.id));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/courses/[id]', params: { id: course.id } });
});
test('guest never queries or exposes preserved guest records', async () => {
  mockAuth = { ready: true, account: null }; await render(<HomeScreen />);
  expect(mockRead).not.toHaveBeenCalled(); expect(screen.queryByTestId('home-initial')).toBeNull();
});
