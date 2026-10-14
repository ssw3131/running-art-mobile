import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import RunResultScreen from '../../src/app/run-result';
let mockResult: any;
const mockPush=jest.fn(),mockRetry=jest.fn();
jest.mock('../../src/features/achievements/use-run-result',()=>({useRunResult:()=>({...mockResult,retry:mockRetry})}));
jest.mock('expo-router',()=>({Stack:{Screen:()=>null},useLocalSearchParams:()=>({id:'a'.repeat(32)}),router:{push:(...args:any[])=>mockPush(...args)}}));
jest.mock('../../src/features/service/open-service-tab',()=>({openServiceTab:jest.fn()}));
beforeEach(()=>{mockPush.mockReset();mockRetry.mockReset();mockResult={data:null,error:''};});
test('UI-S5-01 loading and error never advertise an award, retry is explicit',async()=>{
 const view=await render(<RunResultScreen/>);expect(screen.queryByTestId('run-result-badge')).toBeNull();
 mockResult={data:null,error:'기록을 확인해 주세요.'};await view.rerender(<RunResultScreen/>);
 await fireEvent.press(screen.getByText('다시 불러오기'));expect(mockRetry).toHaveBeenCalledTimes(1);
});
test('UI-S5-02 stopped and finished outcomes remain distinct, share opens the selected record',async()=>{
 const snapshot={shape:'heart',target:[[127,37],[127.01,37.01],[127,37]]};
 const data={run:{status:'completed',courseOutcome:'stopped',distanceM:3000,activeMs:1800000},course:{snapshot},achievements:{finishedCourses:2,currentStreak:3,badges:[{shape:'heart',count:2}]}};
 mockResult={data,error:''};const view=await render(<RunResultScreen/>);
 expect(screen.queryByTestId('run-result-badge')).toBeNull();
 mockResult={data:{...data,run:{...data.run,courseOutcome:'finished'}},error:''};await view.rerender(<RunResultScreen/>);
 expect(screen.getByTestId('run-result-badge')).toHaveTextContent('하트 · 2회 완주');
 await fireEvent.press(screen.getByTestId('run-result-share'));expect(mockPush).toHaveBeenCalledWith({pathname:'/run-card',params:{id:'a'.repeat(32)}});
 expect(screen.queryByText(/칼로리/)).toBeNull();
});
