import React from 'react';
import { fireEvent,render,screen } from '@testing-library/react-native';
import LiveGuidancePanel from '../../src/features/running/LiveGuidancePanel';
jest.mock('../../src/features/guidance/GuidanceMap',()=>({__esModule:true,default:()=>null}));
jest.mock('../../src/modules/running/runtime',()=>({running:{retryNavigation:jest.fn()}}));
jest.mock('../../src/modules/guidance/native',()=>({guidanceNative:null}));
const mockState={direction:'left',instruction:'다음 교차로에서 좌회전',instructionM:250,status:'normal',phase:'lap',remainingM:1800,totalM:5000,progressM:3200,returnPath:[],trace:[]};
jest.mock('../../src/modules/running/guidance',()=>({createRunGuidance:()=>({tick:()=>mockState,snapshot:()=>mockState})}));
const run:any={id:'a',status:'running',startedAt:0,checkpointAt:1000,activeMs:10000,distanceM:3200};
const guide:any={course:{name:'하트',snapshot:{route:[]}},checkpoint:{},options:{mode:'focus',voice:true,background:true}};
function props(){return {run,guide,points:[],now:1000,busy:false,error:'',onOptions:jest.fn(),onPauseResume:jest.fn(),onFinish:jest.fn(),onPermission:jest.fn()};}
test('UI-LIVE-01: actual metrics and separate pause/end callbacks, persisted settings are independent',async()=>{
 const p=props();await render(<LiveGuidancePanel {...p}/>);expect(screen.getByTestId('run-distance')).toHaveTextContent('3.20 km');
 await fireEvent.press(screen.getByTestId('run-pause'));expect(p.onPauseResume).toHaveBeenCalledTimes(1);expect(p.onFinish).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByTestId('run-guidance-settings'));await fireEvent.press(screen.getByTestId('run-background'));
 expect(p.onOptions).toHaveBeenLastCalledWith({mode:'focus',voice:true,background:false});await fireEvent.press(screen.getByTestId('run-guidance-mode'));
 expect(p.onOptions).toHaveBeenLastCalledWith({mode:'map',voice:true,background:true});
});
test('UI-LIVE-02: touch lock neither changes background tracking nor finishes; accessibility unlock works',async()=>{
 const p=props();await render(<LiveGuidancePanel {...p}/>);await fireEvent.press(screen.getByTestId('run-guidance-settings'));await fireEvent.press(screen.getByTestId('run-touch-lock'));
 expect(screen.getByTestId('run-touch-unlock')).toBeVisible();expect(p.onOptions).not.toHaveBeenCalled();expect(p.onFinish).not.toHaveBeenCalled();
 await fireEvent(screen.getByTestId('run-touch-unlock'),'accessibilityAction',{nativeEvent:{actionName:'activate'}});expect(screen.queryByTestId('run-touch-unlock')).toBeNull();
 await fireEvent.press(screen.getByTestId('run-finish'));expect(p.onFinish).toHaveBeenCalledTimes(1);
});

test('UI-LIVE-03: long press keeps the modal until release so the next pause is actionable',async()=>{
 const p=props();await render(<LiveGuidancePanel {...p}/>);
 await fireEvent.press(screen.getByTestId('run-guidance-settings'));await fireEvent.press(screen.getByTestId('run-touch-lock'));
 await fireEvent(screen.getByTestId('run-touch-unlock'),'pressIn');
 await fireEvent(screen.getByTestId('run-touch-unlock'),'pressOut');
 expect(screen.getByTestId('run-touch-unlock')).toBeVisible();
 await fireEvent(screen.getByTestId('run-touch-unlock'),'pressIn');
 await fireEvent(screen.getByTestId('run-touch-unlock'),'longPress');
 expect(screen.getByTestId('run-touch-unlock')).toBeVisible();
 await fireEvent(screen.getByTestId('run-touch-unlock'),'pressOut');
 expect(screen.queryByTestId('run-touch-unlock')).toBeNull();
 await fireEvent.press(screen.getByTestId('run-pause'));expect(p.onPauseResume).toHaveBeenCalledTimes(1);
});
