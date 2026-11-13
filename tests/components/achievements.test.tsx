import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import RunResultScreen from '../../src/app/run-result';
import CompletedDetail from '../../src/features/running/CompletedDetail';
let mockResult: any;
const mockPush=jest.fn(),mockRetry=jest.fn();
jest.mock('../../src/features/achievements/use-run-result',()=>({useRunResult:()=>({...mockResult,retry:mockRetry})}));
jest.mock('expo-router',()=>({useFocusEffect:(effect:any)=>require('react').useEffect(effect,[effect]),Stack:{Screen:()=>null},useLocalSearchParams:()=>({id:'a'.repeat(32)}),router:{push:(...args:any[])=>mockPush(...args)}}));
jest.mock('../../src/features/service/open-service-tab',()=>({openServiceTab:jest.fn()}));
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({ready:true,account:{id:'owner',name:'러너'}})}));
jest.mock('../../src/modules/auth/runtime',()=>({authentication:{getSnapshot:()=>({account:{id:'owner'}})}}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:jest.fn()}));
jest.mock('../../src/modules/courses/share-gpx',()=>({shareRunCourseGpx:jest.fn()}));
jest.mock('../../src/features/terrain/use-terrain',()=>({useTerrain:()=>({state:{status:'idle',profile:null}})}));
jest.mock('../../src/features/course-generation/use-point-address',()=>({usePointAddress:()=>({label:'Test region',address:'Test region'})}));
jest.mock('../../src/features/running/RunPath',()=>()=>null);
jest.mock('../../src/features/running/RunSharePanel',()=>()=>null);
beforeEach(()=>{mockPush.mockReset();mockRetry.mockReset();mockResult={data:null,error:''};});
test('UI-S5-01 loading and error never advertise an award, retry is explicit',async()=>{
 const view=await render(<RunResultScreen/>);expect(screen.queryByTestId('run-result-badge')).toBeNull();
 mockResult={data:null,error:'기록을 확인해 주세요.'};await view.rerender(<RunResultScreen/>);
 await fireEvent.press(screen.getByText('다시 불러오기'));expect(mockRetry).toHaveBeenCalledTimes(1);
});
test('UI-S5-02 stopped and finished outcomes remain distinct, share opens the selected record',async()=>{
 const snapshot={shape:'heart',origin:{lat:37,lng:127},lengthKm:3,target:[[127,37],[127.01,37.01],[127,37]]};
 const data={run:{status:'completed',startedAt:Date.UTC(2026,9,24),courseOutcome:'stopped',distanceM:3000,activeMs:1800000},course:{snapshot,name:'하트 코스'},points:[],achievements:{finishedCourses:2,currentStreak:3,badges:[{shape:'heart',count:2,firstRunId:'other'}]}};
 mockResult={data,error:''};const view=await render(<RunResultScreen/>);
 expect(screen.queryByTestId('run-result-badge')).toBeNull();
 mockResult={data:{...data,run:{...data.run,courseOutcome:'finished'}},error:''};await view.rerender(<RunResultScreen/>);
 expect(screen.getByTestId('completion-trophy')).toBeTruthy();
 expect(screen.queryByTestId('completion-first-badge')).toBeNull();
 await fireEvent.press(screen.getByTestId('run-result-share'));expect(mockPush).toHaveBeenCalledWith({pathname:'/run-card',params:{id:'a'.repeat(32)}});
 mockResult={data:{...data,run:{...data.run,courseOutcome:'finished'},achievements:{...data.achievements,badges:[{shape:'heart',count:2,firstRunId:'a'.repeat(32)}]}},error:''};await view.rerender(<RunResultScreen/>);
 expect(screen.getByTestId('run-result-badge')).toHaveTextContent('하트 코스');expect(screen.getByTestId('completion-first-badge')).toBeTruthy();expect(screen.getByTestId('completion-trophy')).toBeTruthy();
 mockResult={...mockResult,data:{...mockResult.data,course:{...mockResult.data.course,snapshot:{...snapshot,target:[]}}}};await view.rerender(<RunResultScreen/>);
 expect(screen.getByTestId('completion-first-badge')).toBeTruthy();
 mockResult={data:{...data,course:null,run:{...data.run,courseOutcome:null}},error:''};await view.rerender(<RunResultScreen/>);
 expect(screen.queryByTestId('completion-first-badge')).toBeNull();expect(screen.queryByTestId('completion-trophy')).toBeNull();
 expect(screen.queryByText(/칼로리/)).toBeNull();
});
test('calories use the stated 60kg default and simulated estimates are explicitly labelled',async()=>{
 const snapshot={shape:'heart',origin:{lat:37,lng:127},lengthKm:10,target:[[127,37],[127.01,37.01],[127,37]]};
 const data={run:{status:'completed',startedAt:Date.UTC(2026,10,8),courseOutcome:'finished',distanceM:5200,activeMs:1800000,reason:null},course:{snapshot,name:'하트 코스'},points:[],achievements:{finishedCourses:1,currentStreak:1,badges:[]}};
 mockResult={data,error:''};const view=await render(<RunResultScreen/>);
 expect(screen.getByTestId('calorie-estimate-note')).toHaveTextContent(/기본 몸무게 60kg/);
 expect(screen.getByLabelText('칼로리 소모 추정 312 kcal')).toBeVisible();
 mockResult={data:{...data,weightKg:70},error:''};await view.rerender(<RunResultScreen/>);
 expect(screen.getByLabelText('칼로리 소모 추정 364 kcal')).toBeVisible();expect(screen.getByTestId('calorie-estimate-note')).toHaveTextContent(/현재 설정 체중 70kg/);
 mockResult={data:{...data,weightKg:70,run:{...data.run,reason:'[시뮬레이션]'}},error:''};await view.rerender(<RunResultScreen/>);
 expect(screen.getByTestId('calorie-estimate-note')).toHaveTextContent(/시뮬레이션상 예상치/);
});


test.each([true,false])('completed detail shares this record and keeps retry available (first badge: %s)',async first=>{
 const id='a'.repeat(32),snapshot={shape:'heart',origin:{lat:37,lng:127},lengthKm:3,target:[[127,37],[127.01,37.01],[127,37]]};
 const data={run:{id,status:'completed',startedAt:Date.UTC(2026,10,8),courseOutcome:'finished',distanceM:3000,activeMs:1800000},course:{snapshot,name:'하트 코스'},points:[],shapeCompletion:first?1:2,achievements:{finishedCourses:2,badges:[{shape:'heart',firstRunId:first?id:'older'}]}};
 mockResult={data,error:''};
 await render(<CompletedDetail id={id}/>);
 expect(screen.getByTestId('run-rechallenge')).toBeEnabled();
 await fireEvent.press(screen.getByTestId('completed-share'));
 expect(mockPush).toHaveBeenCalledWith({pathname:'/run-card',params:{id}});
});
