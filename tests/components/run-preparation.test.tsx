import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, BackHandler, Text } from 'react-native';
import CourseRunPreparation from '../../src/features/running/CourseRunPreparation';

let mockPosition: (value: any) => void;
const mockRemove = jest.fn();
const mockSetParams=jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn(), setParams: (value:any)=>mockSetParams(value) }, useFocusEffect: (effect: any) => require('react').useEffect(effect, [effect]) }));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  getForegroundPermissionsAsync: async () => ({ granted: true, android: { accuracy: 'fine' } }),
  hasServicesEnabledAsync: async () => true,
  watchPositionAsync: async (_options: any, callback: any) => { mockPosition = callback; return { remove: mockRemove }; },
}));
jest.mock('../../src/modules/storage/database', () => ({ getStorage: async () => ({
  courses: { get: async (id: string) => ({ id, name: '시험 코스', snapshot: { route: [[127,37],[127.001,37],[127,37]], lengthKm: 1 } }) },
  account: { preferences: async () => ({ guidance: { background: true } }) },
}) }));
jest.mock('../../src/modules/running/guidance', () => ({
  validateRunCourse: (course: any) => course,
  startReadiness: (_course: any, fix: any, now: number) => fix && now-fix.timestamp<=5000 && fix.accuracy<=30
    ? { ready:true,distanceM:0,message:'코스 위에 있어요.' } : { ready:false,distanceM:null,message:'정확한 위치를 기다려 주세요.' },
}));
jest.mock('../../src/modules/guidance/engine', () => ({ createGuidance: () => ({ snapshot: () => ({}) }) }));
jest.mock('../../src/features/guidance/GuidanceMap', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/features/running/use-preparation-approach', () => ({ usePreparationApproach: () => ({plan:null,readPlan:()=>null,error:'',retry:jest.fn()}) }));

beforeEach(() => { jest.useFakeTimers(); AppState.currentState='active'; mockSetParams.mockReset(); });
afterEach(() => jest.useRealTimers());

test('start stays visible and actionable as GPS expires; confirmation reads the latest preview', async () => {
  const onStart=jest.fn();
  await render(<CourseRunPreparation id="course" busy={false} onStart={onStart}/>);
  await fireEvent.press(screen.getByTestId('run-preparation-confirm'));
  expect(screen.getByTestId('run-course-start')).toBeEnabled();
  await act(async () => { mockPosition({timestamp:Date.now(),coords:{latitude:37,longitude:127,accuracy:5}}); });
  await fireEvent.press(screen.getByTestId('run-course-start'));
  const preparation=onStart.mock.calls[0][0];
  expect(preparation.courseId).toBe('course');
  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(screen.getByTestId('run-course-start')).toBeEnabled();
  const timestamp=Date.now();
  await act(async () => { mockPosition({timestamp,coords:{latitude:37,longitude:127.001,accuracy:6}}); });
  expect(preparation.read().fix).toMatchObject({timestamp,longitude:127.001,accuracy:6});
});

test('busy preparation keeps the same start control disabled and releases preview watch on unmount', async () => {
  const onStart=jest.fn();
  const view=await render(<CourseRunPreparation id="course" busy={false} onStart={onStart}/>);
  await fireEvent.press(screen.getByTestId('run-preparation-confirm'));
  await fireEvent.press(screen.getByTestId('run-course-start'));
  const preparation=onStart.mock.calls[0][0];
  await view.rerender(<CourseRunPreparation id="course" busy onStart={onStart}/>);
  expect(screen.getByTestId('run-course-start')).toBeDisabled();
  expect(screen.getByTestId('run-course-start')).toHaveTextContent('준비 중');
  await view.unmount();
  expect(mockRemove).toHaveBeenCalled();
  expect(preparation.read().fix).toBeNull();
});

test.each([false,true])('back cancels preparation and releases GPS without starting (notice=%s)',async notice=>{
  const start=jest.fn();
  const back=jest.spyOn(BackHandler,'addEventListener');
  function Harness(){
    const [selected,setSelected]=React.useState(true);
    mockSetParams.mockImplementation((value:any)=>{if(value.courseId===undefined)setSelected(false);});
    return selected?<CourseRunPreparation id="course" busy={false} onStart={start}/>:<Text>코스 목록</Text>;
  }
  const view=await render(<Harness/>);
  if(notice){await fireEvent(screen.getByText('코스 위에서 러닝을 시작해요.'),'requestClose');}
  else{
    await fireEvent.press(screen.getByTestId('run-preparation-confirm'));
    const handler=back.mock.calls.findLast(([event])=>event==='hardwareBackPress')![1];
    await act(()=>{expect(handler()).toBe(true);});
  }
  expect(screen.getByText('코스 목록')).toBeVisible();
  expect(screen.queryByTestId('run-course-start')).toBeNull();
  expect(mockRemove).toHaveBeenCalled();expect(start).not.toHaveBeenCalled();
  await view.unmount();back.mockRestore();
});
