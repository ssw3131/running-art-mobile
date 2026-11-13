import React from 'react';
import {Text} from 'react-native';
import {act,render,screen,waitFor} from '@testing-library/react-native';
import {usePreparationApproach} from '../../src/features/running/use-preparation-approach';
const mockPlan=jest.fn();
jest.mock('expo-router',()=>({useFocusEffect:(f:any)=>require('react').useEffect(f,[f])}));
jest.mock('../../src/modules/running/navigation',()=>({planApproach:(r:any,s:any)=>mockPlan(r,s)}));
const route=[[127,37],[127,37.002],[127.002,37.002],[127,37]],course:any={id:'a',snapshot:{route}},fix:any={timestamp:Date.now(),latitude:37,longitude:126.999,accuracy:5};
function Probe({point=fix,enabled=true,observedAt}:{point?:any;enabled?:boolean;observedAt:number}){const value=usePreparationApproach(course,point,observedAt,enabled);return <><Text testID="error">{value.error}</Text><Text testID="ready">{String(value.ready)}</Text><Text testID="path">{value.plan?JSON.stringify(value.plan.path):'no path'}</Text></>;}

function productionHook(){
 const {readFileSync}=require('node:fs'),{resolve,dirname}=require('node:path');
 const filename=resolve('src/features/running/use-preparation-approach.ts');
 const code=require('@babel/core').transformSync(readFileSync(filename,'utf8'),{
  filename,configFile:false,babelrc:false,envName:'production',
  presets:[['babel-preset-expo',{disableImportExportTransform:false}]],
  caller:{name:'metro',bundler:'metro',platform:'android',engine:'hermes',isDev:false,isServer:false,isNodeModule:false,supportsStaticESM:false,supportsReactCompiler:true},
 }).code;
 const compiled={exports:{} as any};
 new Function('require','module','exports',code)((name:string)=>require(name.startsWith('.')?resolve(dirname(filename),name):name),compiled,compiled.exports);
 return compiled.exports.usePreparationApproach as typeof usePreparationApproach;
}

test.each(['normal','production'])('%s: a new fix between clock ticks is ready; future and stale fixes stay invalid',async(mode)=>{
 jest.useFakeTimers();
 try{
  const useApproach=mode==='production'?productionHook():usePreparationApproach;
  function ClockProbe({point,observedAt}:{point:any;observedAt:number}){const value=useApproach(course,point,observedAt);return <Text testID="ready">{String(value.ready)}</Text>;}
  const point={timestamp:Date.now(),latitude:37,longitude:127,accuracy:5};
  const view=await render(<ClockProbe point={point} observedAt={Date.now()}/>);
  expect(screen.getByTestId('ready')).toHaveTextContent('true');
  await act(()=>jest.advanceTimersByTime(400));
  await view.rerender(<ClockProbe point={{...point,timestamp:Date.now()}} observedAt={Date.now()}/>);
  expect(screen.getByTestId('ready')).toHaveTextContent('true');
  await view.rerender(<ClockProbe point={{...point,timestamp:Date.now()+1}} observedAt={Date.now()}/>);
  expect(screen.getByTestId('ready')).toHaveTextContent('false');
  await view.rerender(<ClockProbe point={{...point,timestamp:Date.now()-5001}} observedAt={Date.now()}/>);
  expect(screen.getByTestId('ready')).toHaveTextContent('false');
  await view.rerender(<ClockProbe point={{...point,timestamp:Date.now()}} observedAt={Date.now()}/>);
  expect(screen.getByTestId('ready')).toHaveTextContent('true');
  await act(()=>jest.advanceTimersByTime(6000));
  expect(screen.getByTestId('ready')).toHaveTextContent('false');
  await view.unmount();
 }finally{jest.useRealTimers();}
});
test('preparation waits for a pedestrian route and keeps an in-flight request through small GPS jitter',async()=>{
 const point={...fix,timestamp:Date.now()};let complete:(v:any)=>void;let signal:AbortSignal;mockPlan.mockImplementation((_r:any,s:AbortSignal)=>{signal=s;return new Promise(resolve=>{complete=resolve;});});const view=await render(<Probe point={point} observedAt={Date.now()}/>);await waitFor(()=>expect(mockPlan).toHaveBeenCalledTimes(1));expect(screen.getByTestId('path')).toHaveTextContent('no path');expect(screen.getByTestId('ready')).toHaveTextContent('false');
 await view.rerender(<Probe point={{...point,longitude:126.999001}} observedAt={Date.now()}/>);expect(mockPlan).toHaveBeenCalledTimes(1);expect(signal!.aborted).toBe(false);
 const path=[[126.999,37],[126.999,37.0003],[127,37.0003],[127,37]];await act(()=>complete!({path,targetM:0,distanceM:160}));await waitFor(()=>expect(screen.getByTestId('path')).toHaveTextContent(JSON.stringify(path)));expect(screen.getByTestId('ready')).toHaveTextContent('true');await view.unmount();
});

test('starting cancels a preview request so the controller does not compete with it',async()=>{
 mockPlan.mockClear();let signal:AbortSignal;
 mockPlan.mockImplementation((_r:any,s:AbortSignal)=>{signal=s;return new Promise((_resolve,reject)=>s.addEventListener('abort',()=>reject(new Error('cancelled'))));});
 const view=await render(<Probe point={{...fix,timestamp:Date.now()}} observedAt={Date.now()}/>);
 await waitFor(()=>expect(mockPlan).toHaveBeenCalledTimes(1));
 await view.rerender(<Probe point={{...fix,timestamp:Date.now()}} observedAt={Date.now()} enabled={false}/>);
 expect(signal!.aborted).toBe(true);expect(mockPlan).toHaveBeenCalledTimes(1);
 await view.unmount();
});

test('10 second deadline aborts an unresponsive planner and ignores a late path',async()=>{
 jest.useFakeTimers();mockPlan.mockClear();let complete:(p:any)=>void;let signal:AbortSignal;mockPlan.mockImplementation((_r:any,s:AbortSignal)=>{signal=s;return new Promise(resolve=>{complete=resolve;});});
 const view=await render(<Probe point={{...fix,timestamp:Date.now()}} observedAt={Date.now()}/>);await act(()=>jest.advanceTimersByTime(10000));expect(signal!.aborted).toBe(true);expect(screen.getByTestId('error')).toHaveTextContent('코스 이동 경로를 찾지 못했어요.');
 await act(()=>complete!({path:[[126.999,37],[127,37]],distanceM:90,targetM:0}));expect(screen.getByTestId('path')).toHaveTextContent('no path');await view.unmount();jest.useRealTimers();
});
