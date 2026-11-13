import React from 'react';
import {Text} from 'react-native';
import {act,render,screen,waitFor} from '@testing-library/react-native';
import {usePreparationApproach} from '../../src/features/running/use-preparation-approach';
const mockPlan=jest.fn();
jest.mock('expo-router',()=>({useFocusEffect:(f:any)=>require('react').useEffect(f,[f])}));
jest.mock('../../src/modules/running/navigation',()=>({planApproach:(r:any,s:any)=>mockPlan(r,s)}));
const route=[[127,37],[127,37.002],[127.002,37.002],[127,37]],course:any={id:'a',snapshot:{route}},fix:any={timestamp:Date.now(),latitude:37,longitude:126.999,accuracy:5};
function Probe({point=fix,enabled=true}:{point?:any;enabled?:boolean}){const value=usePreparationApproach(course,point,enabled);return <><Text testID="error">{value.error}</Text><Text testID="ready">{String(value.ready)}</Text><Text testID="path">{value.plan?JSON.stringify(value.plan.path):'no path'}</Text></>;}
test('preparation waits for a pedestrian route and keeps an in-flight request through small GPS jitter',async()=>{
 let complete:(v:any)=>void;let signal:AbortSignal;mockPlan.mockImplementation((_r:any,s:AbortSignal)=>{signal=s;return new Promise(resolve=>{complete=resolve;});});const view=await render(<Probe/>);await waitFor(()=>expect(mockPlan).toHaveBeenCalledTimes(1));expect(screen.getByTestId('path')).toHaveTextContent('no path');expect(screen.getByTestId('ready')).toHaveTextContent('false');
 await view.rerender(<Probe point={{...fix,longitude:126.999001}}/>);expect(mockPlan).toHaveBeenCalledTimes(1);expect(signal!.aborted).toBe(false);
 const path=[[126.999,37],[126.999,37.0003],[127,37.0003],[127,37]];await act(()=>complete!({path,targetM:0,distanceM:160}));await waitFor(()=>expect(screen.getByTestId('path')).toHaveTextContent(JSON.stringify(path)));expect(screen.getByTestId('ready')).toHaveTextContent('true');await view.unmount();
});

test('starting cancels a preview request so the controller does not compete with it',async()=>{
 mockPlan.mockClear();let signal:AbortSignal;
 mockPlan.mockImplementation((_r:any,s:AbortSignal)=>{signal=s;return new Promise((_resolve,reject)=>s.addEventListener('abort',()=>reject(new Error('cancelled'))));});
 const view=await render(<Probe point={{...fix,timestamp:Date.now()}}/>);
 await waitFor(()=>expect(mockPlan).toHaveBeenCalledTimes(1));
 await view.rerender(<Probe point={{...fix,timestamp:Date.now()}} enabled={false}/>);
 expect(signal!.aborted).toBe(true);expect(mockPlan).toHaveBeenCalledTimes(1);
 await view.unmount();
});

test('10 second deadline aborts an unresponsive planner and ignores a late path',async()=>{
 jest.useFakeTimers();mockPlan.mockClear();let complete:(p:any)=>void;let signal:AbortSignal;mockPlan.mockImplementation((_r:any,s:AbortSignal)=>{signal=s;return new Promise(resolve=>{complete=resolve;});});
 const view=await render(<Probe point={{...fix,timestamp:Date.now()}}/>);await act(()=>jest.advanceTimersByTime(10000));expect(signal!.aborted).toBe(true);expect(screen.getByTestId('error')).toHaveTextContent('코스 이동 경로를 찾지 못했어요.');
 await act(()=>complete!({path:[[126.999,37],[127,37]],distanceM:90,targetM:0}));expect(screen.getByTestId('path')).toHaveTextContent('no path');await view.unmount();jest.useRealTimers();
});
