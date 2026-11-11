import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import HomeScreen from '../../src/features/service/HomeScreen';

let mockAuth: any;
let mockFocusEpoch = 0;
const mockCoursesList=jest.fn();
const mockRead = jest.fn(), mockNavigate = jest.fn(), mockPush = jest.fn();
jest.mock('../../src/modules/auth/runtime',()=>({authentication:{getSnapshot:()=>mockAuth}}));
jest.mock('../../src/features/auth/use-auth', () => ({ useAuth: () => mockAuth }));
jest.mock('../../src/modules/storage/database', () => ({ getStorage: async () => ({ home: { read: () => mockRead() },courses:{list:(...args:any[])=>mockCoursesList(...args)} }) }));
jest.mock('expo-router', () => ({ router: { navigate: (...args: any[]) => mockNavigate(...args), push: (...args: any[]) => mockPush(...args) },
  useFocusEffect: (effect: any) => require('react').useEffect(effect, [effect, mockFocusEpoch]) }));
jest.mock('../../src/features/service/HomePreview', () => ({ HomePreview: () => null }));
const data = (owner = 'A') => ({ owner, monthStart: 0, monthEnd: 1, monthlyDistanceM: 3200, runCount: 0, currentStreak: 0, latestCompleted: null, courseCount: 0, courses: [], recent: [] });
const run = { id: 'a'.repeat(32), status: 'completed', distanceM: 3200, activeMs: 100000, startedAt: 1000, courseName: '하트', courseId:'course',courseOutcome:'finished' };
beforeEach(() => { jest.useFakeTimers(); mockFocusEpoch = 0; mockAuth = { ready: true, account: { id: 'A', name: '러너' } }; mockRead.mockReset(); mockNavigate.mockReset(); mockPush.mockReset(); AppState.currentState = 'active'; });
afterEach(() => { jest.useRealTimers(); });

test('returning home keeps existing rows during refresh so native scroll is not reset', async () => {
  let finish!: (value: any) => void;
  const history = { ...data(), runCount: 1, recent: [{ run, paths: [] }] };
  mockRead.mockResolvedValueOnce(history).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = await render(<HomeScreen />);
  expect(screen.getByTestId('home-run-' + run.id)).toBeVisible();
  mockFocusEpoch++;
  await view.rerender(<HomeScreen />);
  expect(screen.queryByTestId('home-loading')).toBeNull();
  expect(screen.getByTestId('home-run-' + run.id)).toBeVisible();
  await act(async () => finish(history));
  expect(screen.getByTestId('home-run-' + run.id)).toBeVisible();
});

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

test('UI-HOME-02: unfinished course stays in saved courses, not completed history; opening does not resume GPS', async () => {
  const course={id:'course',name:'하트',lengthKm:3,createdAt:1000,source:'osm',unfinished:true};
  mockRead.mockResolvedValue({...data(),runCount:1,courses:[{course,paths:[]}],completed:[],recent:[{run:{...run,status:'interrupted'},paths:[]}]});
  await render(<HomeScreen/>);
  expect(screen.getByTestId('home-course-progress-course')).toHaveTextContent('진행중');
  expect(screen.queryByTestId('home-run-'+run.id)).toBeNull();
  await fireEvent.press(screen.getByTestId('home-course-course'));
  expect(mockPush).toHaveBeenCalledWith({pathname:'/courses/[id]',params:{id:'course'}});
});

test('UI-HOME-03: history opens the real record and matching archive, without guest entry', async () => {
  mockRead.mockResolvedValue({ ...data(), runCount: 1, recent: [{ run, paths: [] }] });
  await render(<HomeScreen />);
  expect(screen.getByTestId('home-history')).toBeVisible(); expect(screen.queryByText('12일')).toBeNull();
  await fireEvent.press(screen.getByTestId('home-run-' + run.id));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/runs/[id]', params: { id: run.id } });
  await fireEvent.press(screen.getByTestId('home-more-runs'));
  expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/courses', params: { view: 'runs', fromHome: '1' } });
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

test('returning home starts a conditions request without replacing the previously chosen shape', async () => {
  mockRead.mockResolvedValue({ ...data(), runCount: 1, recent: [{ run, paths: [] }] });
  await render(<HomeScreen />);
  await fireEvent.press(screen.getByTestId('open-route-lab'));
  expect(mockNavigate.mock.lastCall?.[0]).toEqual({ pathname: '/route-lab', params: {
    homeSection: 'conditions', homeRequest: expect.any(String), homeShape: undefined,
  } });
});

const challengeBadge={definition:{id:'heart',kind:'shape',title:'하트 코스',accent:'첫 완주',goal:1,shapes:['heart']},progress:0,earned:false,earnedAt:null,runIds:[],completedShapes:[]};
test('badge challenge selects an existing saved course and earned badges link to their details',async()=>{
  mockRead.mockResolvedValue({...data(),runCount:1,badges:[challengeBadge,{...challengeBadge,definition:{...challengeBadge.definition,id:'star',title:'별 코스'},earned:true,earnedAt:1000}]});
  mockCoursesList.mockResolvedValue([{id:'saved-heart',shape:'heart'}]);
  await render(<HomeScreen/>);
  expect(screen.queryByTestId('home-earned-heart')).toBeNull();
  await fireEvent.press(screen.getByTestId('home-earned-star'));
  expect(mockPush).toHaveBeenCalledWith({pathname:'/badge-detail',params:{id:'star'}});
  await fireEvent.press(screen.getByTestId('home-challenge-start'));
  expect(mockPush).toHaveBeenCalledWith({pathname:'/courses/[id]',params:{id:'saved-heart'}});
});
test('badge challenge with no saved match preselects its shape, without generating a course',async()=>{
  mockRead.mockResolvedValue({...data(),runCount:1,badges:[challengeBadge]});mockCoursesList.mockResolvedValue([]);
  await render(<HomeScreen/>);await fireEvent.press(screen.getByTestId('home-challenge-start'));
  expect(mockNavigate).toHaveBeenCalledWith({pathname:'/route-lab',params:{homeShape:'heart',homeSection:'conditions',homeRequest:expect.any(String)}});
});
