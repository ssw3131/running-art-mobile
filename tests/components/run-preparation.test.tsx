import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, BackHandler, Text } from 'react-native';
import CourseRunPreparation from '../../src/features/running/CourseRunPreparation';

const mockPlan=jest.fn();
const mockPermission=jest.fn();
const mockCourse=jest.fn();
let mockPosition: (value: any) => void;
const mockRemove = jest.fn();
const mockSetParams=jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn(), setParams: (value:any)=>mockSetParams(value) }, useFocusEffect: (effect: any) => require('react').useEffect(effect, [effect]) }));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  getForegroundPermissionsAsync: () => mockPermission(),
  requestForegroundPermissionsAsync: () => mockPermission(),
  hasServicesEnabledAsync: async () => true,
  watchPositionAsync: async (_options: any, callback: any) => { mockPosition = callback; return { remove: mockRemove }; },
}));
jest.mock('../../src/modules/storage/database', () => ({ getStorage: async () => ({
  courses: { get: (id:string) => mockCourse(id) },
  account: { preferences: async () => ({ guidance: { background: true } }) },
}) }));
jest.mock('../../src/features/guidance/GuidanceMap', () => ({ __esModule: true, default: (props:any) => require('react').createElement(require('react-native').View,{...props,testID:'preparation-map'}) }));
jest.mock('../../src/modules/running/navigation', () => ({ planApproach: (...args:any[])=>mockPlan(...args) }));
const savedCourse=(id:string)=>({id,name:'시험 코스',snapshot:{schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:1,lengthKm:0.8,score:80,route:[[127,37],[127.002,37],[127.002,37.002],[127,37.002],[127,37]],target:[[127,37],[127.002,37],[127.002,37.002],[127,37.002],[127,37]]}});

beforeEach(() => { jest.useFakeTimers(); AppState.currentState='active';mockPlan.mockReset();mockRemove.mockClear();mockSetParams.mockReset();mockPermission.mockReset().mockResolvedValue({granted:true,android:{accuracy:'fine'}});mockCourse.mockReset().mockImplementation(async(id:string)=>savedCourse(id)); });
afterEach(() => jest.useRealTimers());

test('start stays visible and actionable as GPS expires; confirmation reads the latest preview', async () => {
  const onStart=jest.fn();
  await render(<CourseRunPreparation id="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" busy={false} onStart={onStart}/>);
  await fireEvent.press(screen.getByTestId('run-preparation-confirm'));
  expect(screen.getByTestId('run-course-start')).toBeEnabled();
  await act(async () => { mockPosition({timestamp:Date.now(),coords:{latitude:37,longitude:127,accuracy:5}}); });
  await fireEvent.press(screen.getByTestId('run-course-start'));
  const preparation=onStart.mock.calls[0][0];
  expect(preparation.courseId).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(screen.getByTestId('run-course-start')).toBeEnabled();
  const timestamp=Date.now();
  await act(async () => { mockPosition({timestamp,coords:{latitude:37,longitude:127.001,accuracy:6}}); });
  expect(preparation.read().fix).toMatchObject({timestamp,longitude:127.001,accuracy:6});
});

test('busy preparation keeps the same start control disabled and releases preview watch on unmount', async () => {
  const onStart=jest.fn();
  const view=await render(<CourseRunPreparation id="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" busy={false} onStart={onStart}/>);
  await fireEvent.press(screen.getByTestId('run-preparation-confirm'));
  await fireEvent.press(screen.getByTestId('run-course-start'));
  const preparation=onStart.mock.calls[0][0];
  await view.rerender(<CourseRunPreparation id="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" busy onStart={onStart}/>);
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
    return selected?<CourseRunPreparation id="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" busy={false} onStart={start}/>:<Text>코스 목록</Text>;
  }
  const view=await render(<Harness/>);
  if(notice){await fireEvent(screen.getByText('원하는 곳에서 러닝을 시작해요.'),'requestClose');}
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

test('confirmation is immediate and missing, inaccurate or expired GPS never disables start or routes',async()=>{
 const onStart=jest.fn();await render(<CourseRunPreparation id="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" busy={false} onStart={onStart}/>);
 expect(screen.getByTestId('run-preparation-confirm')).toBeEnabled();
 expect(screen.getByText('코스까지 자유롭게 이동하세요. 합류하면 자동으로 안내를 시작해요.')).toBeVisible();
 await fireEvent.press(screen.getByTestId('run-preparation-confirm'));
 expect(screen.getByTestId('preparation-map').props.showPosition).toBe(false);
 expect(screen.getByTestId('run-course-start')).toBeEnabled();
 await fireEvent.press(screen.getByTestId('run-course-start'));
 expect(onStart.mock.calls[0][0].read()).toEqual({fix:null});
 for(const point of [{timestamp:Date.now(),accuracy:100},{timestamp:Date.now(),accuracy:5},{timestamp:Date.now()-60000,accuracy:5}]){
  await act(()=>mockPosition({timestamp:point.timestamp,coords:{latitude:37,longitude:126.99,accuracy:point.accuracy}}));
  await act(()=>jest.advanceTimersByTime(16000));
  expect(screen.getByTestId('run-course-start')).toBeEnabled();
  expect(screen.getByTestId('preparation-map').props.state.returnPath).toEqual([]);
 }
 expect(mockPlan).not.toHaveBeenCalled();expect(screen.queryByTestId('run-preparation-loading')).toBeNull();
 expect(onStart).toHaveBeenCalledTimes(1);
});

test('location permission errors allow starting through the controller permission check',async()=>{
 mockPermission.mockResolvedValue({granted:false,android:{accuracy:'coarse'}});
 const onStart=jest.fn();await render(<CourseRunPreparation id="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" busy={false} onStart={onStart}/>);
 await fireEvent.press(screen.getByTestId('run-preparation-confirm'));
 expect(screen.getByText(/정확한 위치를 허용/)).toBeVisible();
 expect(screen.getByTestId('run-course-start')).toBeEnabled();
 await fireEvent.press(screen.getByTestId('run-course-start'));expect(onStart).toHaveBeenCalledTimes(1);
 expect(mockPlan).not.toHaveBeenCalled();
});

test('a missing or still-loading course cannot start, but its notice remains dismissible',async()=>{
 let complete!:(value:any)=>void;mockCourse.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
 const onStart=jest.fn();await render(<CourseRunPreparation id="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" busy={false} onStart={onStart}/>);
 expect(screen.getByTestId('run-preparation-confirm')).toBeEnabled();await fireEvent.press(screen.getByTestId('run-preparation-confirm'));
 expect(screen.getByTestId('run-course-start')).toBeDisabled();await fireEvent.press(screen.getByTestId('run-course-start'));expect(onStart).not.toHaveBeenCalled();
 await act(()=>complete(savedCourse('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')));expect(screen.getByTestId('run-course-start')).toBeEnabled();
});

test('an invalid course is rejected without using road data',async()=>{
 mockCourse.mockResolvedValue({...savedCourse('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),snapshot:{}});
 const onStart=jest.fn();await render(<CourseRunPreparation id="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" busy={false} onStart={onStart}/>);
 await fireEvent.press(screen.getByTestId('run-preparation-confirm'));
 expect(screen.getByTestId('run-course-start')).toBeDisabled();expect(onStart).not.toHaveBeenCalled();expect(mockPlan).not.toHaveBeenCalled();
});
