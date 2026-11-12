jest.mock('../../src/features/course-generation/GenerationIcon',()=>({GenerationIcon:({name,color}:any)=>require('react').createElement(require('react-native').View,{testID:'icon-'+name,color})}));
jest.mock('../../src/modules/image-contour/picker',()=>({pickContourImage:jest.fn()}));
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CourseGenerationScreen from '../../src/features/course-generation/CourseGenerationScreen';

let mockUsage: any;
jest.mock('../../src/features/usage/use-usage', () => ({ useUsage: () => mockUsage }));
let mockG: any;
let mockMapProps: any;
let mockAccount: { id: string } | null = null;
const mockPush = jest.fn();
jest.mock('../../src/features/course-generation/use-course-generation', () => ({
  useCourseGeneration: () => mockG, locationMessage: () => '지도를 움직여 탐색 중심을 선택해 주세요.',
}));
jest.mock('../../src/features/auth/use-auth', () => ({ useAuth: () => ({ ready: true, account: mockAccount }) }));
jest.mock('../../src/modules/map/MapSurface', () => ({ __esModule: true, default: (props: any) => {
  mockMapProps = props; return require('react').createElement(require('react-native').View, { testID: 'map-preview' });
} }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  router: { push: (...args: any[]) => mockPush(...args) },
  useFocusEffect: (effect: any) => require('react').useEffect(effect, [effect]),
}));
const grid = require('../../assets/route-lab/grid.json');
const baseline = require('../fixtures/route-engine/grid-heart-v02.json').result;
const completed = (count = 2) => ({ result: { ...baseline, candidates: baseline.candidates.slice(0, count) },
  origin: grid.origin, options: { ...grid.options, shape: 'heart', targetKm: 3 }, liveRoads: false });
beforeEach(() => {
  mockUsage = { data: { generation: { used: 2, total: 5 } }, error: '', refresh: jest.fn() };
  mockPush.mockReset();
  mockAccount = null;
  mockG = {
    tab: 'conditions', datasetId: 'grid', dataset: { synthetic: true, input: grid, description: '가상 도로' },
    shape: 'heart', targetKm: 3, customTemplate: null, drawingOpen: false, diagnostics: false,
    state: { kind: 'idle', message: '조건을 선택해 주세요.' }, completed: null, selected: 0, seconds: 0,
    centerState: { center: grid.origin, location: { kind: 'idle' }, position: null }, center: { beginMove: jest.fn(), move: jest.fn() },
    roads: {}, overlay: null, mapMoving: false, validCenter: true, cannotCalculate: false,
  };
  for (const key of ['reset', 'setTab', 'setShape', 'setTargetKm', 'setDrawingOpen', 'setCustomTemplate', 'setDiagnostics', 'setRoadMode', 'setDeviceOnly', 'changeSearch', 'start', 'cancel', 'locate', 'setSelected', 'setFixedCenter', 'setMapMoving', 'setMapReady', 'setValidCenter']) mockG[key] = jest.fn();
  mockG.setTab.mockImplementation((tab: string) => { mockG.tab = tab; });
});

test('UI-GEN-01: generation requires confirmation, cancel does not compute or lose conditions', async () => {
  const chosenOrigin = { lat: 37.58135, lng: 126.96933 };
  mockG.dataset.synthetic = false;
  mockG.centerState.center = chosenOrigin;
  await render(<CourseGenerationScreen />);
  await fireEvent.press(screen.getByTestId('calculate-route'));
  expect(screen.getByText('현재 설정으로 코스 생성할까요?')).toBeVisible();
  expect(mockG.start).not.toHaveBeenCalled();
  expect(screen.getByText('코스 생성 1회 차감')).toBeVisible();
  expect(screen.getByTestId('generation-remaining')).toHaveTextContent('3회');
  expect(screen.getByTestId('generation-after')).toHaveTextContent('2회');
  expect(screen.getByTestId('generation-summary-map')).toHaveTextContent('3Km');
  expect(screen.getByTestId('generation-summary-flag')).toHaveTextContent('하트 코스');
  await fireEvent.press(screen.getByTestId('generation-confirm-cancel'));
  expect(mockG.start).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('calculate-route'));
  await fireEvent.press(screen.getByTestId('generation-confirm'));
  expect(mockG.start).toHaveBeenCalledTimes(1);
  expect(mockG.start).toHaveBeenCalledWith({ origin: chosenOrigin, shape: 'heart', targetKm: 3, customTemplate: undefined });
});

test('UI-GEN-02: unavailable location or a running job cannot open another generation', async () => {
  mockG.cannotCalculate = true;
  await render(<CourseGenerationScreen />);
  expect(screen.getByTestId('calculate-route')).toBeDisabled();
  mockG.cannotCalculate = false; mockG.state = { kind: 'running', message: '계산 중' };
  await screen.rerender(<CourseGenerationScreen />);
  expect(screen.getByTestId('calculate-route')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('cancel-route'));
  expect(mockG.cancel).toHaveBeenCalledTimes(1);
});

test('UI-GEN-03: old result keeps its conditions and real candidate count after editing the next input', async () => {
  mockG.tab = 'conditions'; mockG.completed = completed(); mockG.shape = 'fish'; mockG.targetKm = 7;
  const previous = mockG.completed;
  mockG.state = { kind: 'done', message: '2개 코스를 찾았어요.' };
  await render(<CourseGenerationScreen />);
  expect(screen.getByTestId('generation-changed')).toBeVisible();
  await fireEvent.press(screen.getByTestId('calculate-route'));
  await fireEvent.press(screen.getByTestId('generation-confirm-cancel'));
  expect(mockG.completed).toBe(previous);
  expect(mockG.start).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('generation-view-results'));
  expect(mockG.setTab).toHaveBeenCalledWith('results');
  await screen.rerender(<CourseGenerationScreen />);
  expect(screen.getByText('유사도가 높은 추천 코스 2개')).toBeVisible();
  expect(mockMapProps.origin).toEqual(grid.origin);
  expect(mockMapProps.interactive).toBe(false);
  expect(screen.queryByTestId('candidate-2')).toBeNull();
  expect(screen.getByTestId('candidate-0').props.accessibilityState.selected).toBe(true);
  expect(screen.getAllByText(/예상 러닝 시간 :/).length).toBe(2);
  await fireEvent.press(screen.getByTestId('candidate-1'));
  expect(mockG.setSelected).toHaveBeenCalledWith(1);
  await fireEvent.press(screen.getByTestId('candidate-detail-1'));
  expect(mockPush.mock.lastCall?.[0]).toMatchObject({ pathname: '/course-candidate' });
});

test('UI-GEN-04: target toggle changes the map layer without changing the selected result', async () => {
  mockG.tab = 'results'; mockG.completed = completed(); mockG.overlay = { route: {}, target: {} };
  await render(<CourseGenerationScreen />);
  const overlay = mockMapProps.routeOverlay;
  expect(mockMapProps.showTarget).toBe(true);
  await fireEvent.press(screen.getByTestId('generation-target-toggle'));
  expect(mockMapProps.showTarget).toBe(false);
  expect(mockMapProps.routeOverlay).toBe(overlay);
  expect(mockG.setSelected).not.toHaveBeenCalled();
});

test('UI-GEN-05: zero candidates and failure remain explicit and allow editing', async () => {
  mockG.tab = 'results'; mockG.completed = completed(0); mockG.state = { kind: 'done', message: '없어요' };
  await render(<CourseGenerationScreen />);
  expect(screen.getByTestId('generation-empty')).toBeVisible();
  expect(screen.queryByTestId('candidate-detail-0')).toBeNull();
  await fireEvent.press(screen.getByTestId('generation-edit'));
  expect(mockG.start).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('취소'));
  expect(mockG.start).not.toHaveBeenCalled();
  mockG.tab = 'results'; mockG.completed = null; mockG.state = { kind: 'error', message: '도로 자료를 받을 수 없어요.' };
  await screen.rerender(<CourseGenerationScreen />);
  expect(screen.getByTestId('calculation-error')).toHaveTextContent('도로 자료를 받을 수 없어요.');
  expect(screen.queryByTestId('candidate-0')).toBeNull();
});

test('UI-GEN-06: a condition changed while confirmation was open must be confirmed again', async () => {
  await render(<CourseGenerationScreen />);
  await fireEvent.press(screen.getByTestId('calculate-route'));
  mockG.targetKm = 7;
  await screen.rerender(<CourseGenerationScreen />);
  await fireEvent.press(screen.getByTestId('generation-confirm'));
  expect(mockG.start).not.toHaveBeenCalled();
  expect(screen.getByText('조건이 바뀌었어요. 현재 조건을 다시 확인해 주세요.')).toBeVisible();
});

test('UI-GEN-07: regeneration confirmation preserves results on cancel and uses the original conditions once confirmed', async () => {
  mockG.tab = 'results'; mockG.completed = completed(); mockG.shape = 'fish'; mockG.targetKm = 7;
  const result = mockG.completed;
  await render(<CourseGenerationScreen />);
  await fireEvent.press(screen.getByTestId('generation-edit'));
  expect(mockG.start).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('취소'));
  expect(mockG.start).not.toHaveBeenCalled();
  expect(mockG.start).not.toHaveBeenCalled();
  expect(mockG.completed).toBe(result);
  await fireEvent.press(screen.getByTestId('generation-edit'));
  await fireEvent.press(screen.getByTestId('regeneration-confirm'));
  expect(mockG.start).toHaveBeenCalledTimes(1);
  expect(mockG.start).toHaveBeenCalledWith({origin:result.origin,...result.options});
});

test('UI-GEN-08: real-map updates preserve place input and an open distance draft', async () => {
  mockG.dataset.synthetic = false;
  await render(<CourseGenerationScreen />);
  await fireEvent.changeText(screen.getByTestId('place-search-input'), 'Busan city hall');
  await fireEvent.press(screen.getByTestId('distance-more'));
  await fireEvent.changeText(screen.getByTestId('distance-input'), '20');
  mockG.mapMoving = true;
  await screen.rerender(<CourseGenerationScreen />);
  expect(screen.getByTestId('place-search-input')).toHaveDisplayValue('Busan city hall');
  expect(screen.getByTestId('distance-input')).toHaveDisplayValue('20');
  mockAccount = { id: 'another-owner' };
  await screen.rerender(<CourseGenerationScreen />);
  expect(screen.getByTestId('place-search-input')).toHaveDisplayValue('');
  expect(screen.queryByTestId('distance-input')).toBeNull();
});

test('UI-GEN-09: current location queries GPS without opening the picker and blocks duplicate requests', async () => {
  mockG.dataset.synthetic = false;
  await render(<CourseGenerationScreen />);
  await fireEvent.press(screen.getByTestId('route-locate'));
  expect(mockG.locate).toHaveBeenCalledTimes(1);
  expect(mockPush).not.toHaveBeenCalled();
  mockG.centerState.location = { kind: 'loading' };
  await screen.rerender(<CourseGenerationScreen />);
  expect(screen.getByTestId('route-locate')).toBeDisabled();
});

test('UI-GEN-10: removing the tabs still allows returning to a previous result without generating again', async () => {
  mockG.completed = completed(); mockG.shape = 'fish';
  const previous = mockG.completed;
  await render(<CourseGenerationScreen />);
  await fireEvent.press(screen.getByTestId('generation-view-results'));
  expect(mockG.setTab).toHaveBeenCalledWith('results');
  expect(mockG.completed).toBe(previous);
  expect(mockG.start).not.toHaveBeenCalled();
});


test('confirmation uses real exhausted allowance and never computes on cancel', async () => {
  mockUsage.data.generation = { used: 5, total: 5 };
  await render(<CourseGenerationScreen />);
  await fireEvent.press(screen.getByTestId('calculate-route'));
  expect(screen.getByTestId('generation-remaining')).toHaveTextContent('0회');
  expect(screen.getByTestId('generation-after')).toHaveTextContent('0회');
  expect(screen.getByTestId('generation-confirm')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('generation-confirm-cancel'));
  expect(mockG.start).not.toHaveBeenCalled();
});

test('confirmation does not invent allowance while usage is unavailable', async () => {
  mockUsage.data = null;
  await render(<CourseGenerationScreen />);
  await fireEvent.press(screen.getByTestId('calculate-route'));
  expect(screen.getByTestId('generation-remaining')).toHaveTextContent('—회');
  expect(screen.getByTestId('generation-after')).toHaveTextContent('—회');
  expect(mockG.start).not.toHaveBeenCalled();
});

test('map expansion opens an account-scoped selected draft without generating', async () => {
  mockG.tab = 'results'; mockG.completed = completed(); mockG.selected = 1;
  await render(<CourseGenerationScreen />);
  await fireEvent.press(screen.getByTestId('recommendation-map-open'));
  expect(mockPush.mock.lastCall?.[0]).toMatchObject({ pathname: '/course-map', params: { target: '1' } });
  const { candidateDrafts } = require('../../src/features/course-generation/model');
  const draft = candidateDrafts.get(mockPush.mock.lastCall[0].params.draft, 'guest');
  expect(draft.rank).toBe(2);
  expect(draft.snapshot.shape).toBe('heart');
  expect(mockG.start).not.toHaveBeenCalled();
});


test.each(['cancelled', 'error'])('generation without a completed result returns to editable conditions after %s', async kind => {
  mockG.tab = 'results'; mockG.state = { kind, message: '다시 시도해 주세요.' };
  await render(<CourseGenerationScreen />);
  await fireEvent.press(screen.getByTestId('generation-edit'));
  expect(mockG.reset).toHaveBeenCalledTimes(1);
  expect(mockG.setTab).toHaveBeenCalledWith('conditions');
  expect(screen.queryByTestId('regeneration-confirm')).toBeNull();
  expect(mockG.start).not.toHaveBeenCalled();
  expect(mockG.shape).toBe('heart');
  expect(mockG.targetKm).toBe(3);
});

 test('changing the selected shape removes the heart orange tint',async()=>{
  const view=await render(<CourseGenerationScreen/>);
  mockG.shape='star';await view.rerender(<CourseGenerationScreen/>);
  const heart=screen.getByTestId('icon-heart'),star=screen.getByTestId('icon-star');
  expect(screen.getByTestId('shape-heart').props.accessibilityState.selected).toBe(false);
  expect(screen.getByTestId('shape-star').props.accessibilityState.selected).toBe(true);
  expect(heart!.props.color).not.toBe(star!.props.color);expect(star!.props.color).toBe('#FC5602');
 });
