import React from 'react';
import { fireEvent,render,screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import LiveGuidancePanel from '../../src/features/running/LiveGuidancePanel';
import { createRunningSimulation } from '../../src/modules/running/simulation';
import { offset } from '../../src/modules/guidance/geometry';
jest.mock('../../src/features/running/use-device-heading',()=>({useDeviceHeading:()=>undefined}));
jest.mock('expo-router',()=>({router:{push:jest.fn()}}));
jest.mock('../../src/features/guidance/GuidanceMap',()=>({__esModule:true,default:(props:any)=>require('react').createElement(require('react-native').View,{testID:'live-map',...props})}));
jest.mock('../../src/modules/running/runtime',()=>({running:{retryNavigation:jest.fn()}}));
jest.mock('../../src/modules/guidance/native',()=>({guidanceNative:null}));
const mockState={direction:'left',instruction:'다음 교차로에서 좌회전',instructionM:250,status:'normal',phase:'lap',remainingM:1800,totalM:5000,progressM:3200,returnPath:[],trace:[]};
jest.mock('../../src/modules/running/guidance',()=>({createRunGuidance:()=>({tick:()=>mockState,snapshot:()=>mockState})}));
const run:any={id:'a',status:'running',startedAt:0,checkpointAt:1000,activeMs:10000,distanceM:3200};
const guide:any={course:{name:'하트',snapshot:{route:[]}},checkpoint:{},options:{mode:'focus',voice:true,background:true}};
function props(){return {run,guide,points:[],now:1000,busy:false,error:'',onOptions:jest.fn(),onPauseResume:jest.fn(),onFinish:jest.fn(),onPermission:jest.fn()};}

test('real accelerated simulation resolves overlapping origins into a focus arrow, and signal loss removes it',async()=>{
 const route=[[0,0],[0,3],[0,0],[0,240],[240,240],[240,0],[0,0]].map(([x,y])=>offset([127,37],x,y));
 const simulation=createRunningSimulation(route),p=props();simulation.play(0);
 const view=await render(<LiveGuidancePanel {...p} simulationState={simulation.snapshot()}/>);
 expect(screen.getByTestId('run-direction-waiting')).toBeVisible();
 const moving=simulation.update(1000);
 await view.rerender(<LiveGuidancePanel {...p} simulationState={moving}/>);
 expect(screen.getByTestId('run-direction-arrow')).toBeVisible();
 expect(screen.getByTestId('run-instruction')).toHaveTextContent(moving.instruction);
 simulation.command('lost');
 await view.rerender(<LiveGuidancePanel {...p} simulationState={simulation.update(2000)}/>);
 expect(screen.queryByTestId('run-direction-arrow')).toBeNull();
 expect(screen.getByTestId('run-direction-waiting')).toBeVisible();
});

test('focus shows a confirmed turn arrow and a neutral location icon for an unknown direction, without a permission button',async()=>{
 const p=props();const view=await render(<LiveGuidancePanel {...p}/>);
 expect(screen.getByTestId('run-direction-arrow')).toBeVisible();
 await view.rerender(<LiveGuidancePanel {...p} simulationState={{...mockState,status:'weak',direction:'unknown',instruction:'위치 확인 중'} as any}/>);
 expect(screen.queryByTestId('run-direction-arrow')).toBeNull();
 expect(screen.getByTestId('run-direction-waiting')).toBeVisible();
 expect(screen.queryByText('GPS',{exact:true})).toBeNull();expect(screen.queryByText('위치 권한 설정')).toBeNull();
});

test('map compass follows the measured summary including safe-area/accessory offset',async()=>{
 const p=props();await render(<LiveGuidancePanel {...p} guide={{...guide,options:{...guide.options,mode:'map'}}}/>);
 await fireEvent(screen.getByTestId('run-map-content'),'layout',{nativeEvent:{layout:{x:0,y:45,width:360,height:700}}});
 await fireEvent(screen.getByTestId('run-map-summary'),'layout',{nativeEvent:{layout:{x:0,y:0,width:360,height:222}}});
 expect(screen.getByTestId('live-map').props.compassTop).toBe(279);
 expect(screen.queryByText('위치 권한 설정')).toBeNull();
});
test('UI-LIVE-01: actual metrics and separate pause/end callbacks, persisted settings are independent',async()=>{
 const p=props();await render(<LiveGuidancePanel {...p}/>);expect(screen.getByTestId('run-distance')).toHaveTextContent('3.20 km');
 await fireEvent.press(screen.getByTestId('run-pause'));expect(p.onPauseResume).toHaveBeenCalledTimes(1);expect(p.onFinish).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByTestId('run-guidance-settings'));expect(router.push).toHaveBeenCalledWith({pathname:'/run-settings',params:{runId:'a'}});
 await fireEvent.press(screen.getByTestId('run-guidance-mode'));expect(p.onOptions).toHaveBeenLastCalledWith({mode:'map',voice:true,background:true});
});
test('UI-LIVE-02: touch lock neither changes background tracking nor finishes; accessibility unlock works',async()=>{
 const p=props();p.guide={...guide,options:{...guide.options,touchLock:true}};await render(<LiveGuidancePanel {...p}/>);
 expect(screen.getByTestId('run-touch-unlock')).toBeVisible();expect(p.onOptions).not.toHaveBeenCalled();expect(p.onFinish).not.toHaveBeenCalled();
 await fireEvent(screen.getByTestId('run-touch-unlock'),'accessibilityAction',{nativeEvent:{actionName:'activate'}});expect(screen.queryByTestId('run-touch-unlock')).toBeNull();
 expect(p.onOptions).toHaveBeenLastCalledWith({...p.guide.options,touchLock:false});
 await fireEvent.press(screen.getByTestId('run-finish'));expect(p.onFinish).toHaveBeenCalledTimes(1);
});

test('UI-LIVE-03: long press keeps the modal until release so the next pause is actionable',async()=>{
 const p=props();p.guide={...guide,options:{...guide.options,touchLock:true}};await render(<LiveGuidancePanel {...p}/>);
 await fireEvent(screen.getByTestId('run-touch-unlock'),'pressIn');
 await fireEvent(screen.getByTestId('run-touch-unlock'),'pressOut');
 expect(screen.getByTestId('run-touch-unlock')).toBeVisible();
 await fireEvent(screen.getByTestId('run-touch-unlock'),'pressIn');
 await fireEvent(screen.getByTestId('run-touch-unlock'),'longPress');
 expect(screen.getByTestId('run-touch-unlock')).toBeVisible();
 await fireEvent(screen.getByTestId('run-touch-unlock'),'pressOut');
 expect(screen.queryByTestId('run-touch-unlock')).toBeNull();
 expect(p.onOptions).toHaveBeenLastCalledWith({...p.guide.options,touchLock:false});
 await fireEvent.press(screen.getByTestId('run-pause'));expect(p.onPauseResume).toHaveBeenCalledTimes(1);
});

test('real recorded GPS points, not checkpoint trace, reach the live map with pause gaps preserved',async()=>{
 const p=props(),points:any=[{sequence:1,segment:0,longitude:127,latitude:37,timestamp:1000},{sequence:2,segment:0,longitude:127.001,latitude:37,timestamp:2000},{sequence:3,segment:1,longitude:127.002,latitude:37,timestamp:25000}];
 const view=await render(<LiveGuidancePanel {...p} guide={{...guide,options:{...guide.options,mode:'map'}}} points={points}/>);
 expect(screen.getByTestId('live-map').props.state.trace).toEqual([[[127,37],[127.001,37]],[[127.002,37]]]);
 await view.rerender(<LiveGuidancePanel {...p} guide={{...guide,options:{...guide.options,mode:'map'}}} points={[...points,{...points[2],sequence:4,longitude:127.003,timestamp:26000}]}/>);
 expect(screen.getByTestId('live-map').props.state.trace[1]).toEqual([[127.002,37],[127.003,37]]);
});
