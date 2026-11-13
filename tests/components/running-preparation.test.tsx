import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react-native';
import CourseRunPreparation from '../../src/features/running/CourseRunPreparation';
const mockPush=jest.fn(),mockSetParams=jest.fn();
jest.mock('expo-router',()=>({router:{push:(v:any)=>mockPush(v),setParams:(v:any)=>mockSetParams(v)},useFocusEffect:(f:any)=>require('react').useEffect(f,[f])}));
jest.mock('expo-location',()=>({getForegroundPermissionsAsync:async()=>({granted:true,android:{accuracy:'fine'}}),hasServicesEnabledAsync:async()=>true,watchPositionAsync:async()=>({remove:jest.fn()}),Accuracy:{BestForNavigation:1}}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:async()=>({courses:{get:async()=>({id:'a',name:'하트',snapshot:{route:[[127,37],[127,37.001],[127.001,37.001],[127,37]]}})}})}));
jest.mock('../../src/modules/running/guidance',()=>({validateRunCourse:(c:any)=>c,startReadiness:()=>({ready:false,message:'GPS 준비'})}));
jest.mock('../../src/features/running/use-preparation-approach',()=>({usePreparationApproach:()=>({ready:true,plan:null,readPlan:()=>null,error:'',retry:jest.fn()})}));
jest.mock('../../src/features/guidance/GuidanceMap',()=>({__esModule:true,default:()=>null}));
test('the Figma notice dismisses once, no persistent card or focus switch covers the preparation map, simulation remains separate',async()=>{
 const start=jest.fn();await render(<CourseRunPreparation id="a" busy={false} onStart={start}/>);
 expect(screen.getByText('코스 위에서 러닝을 시작해요.')).toBeVisible();
 await fireEvent.press(screen.getByTestId('run-preparation-confirm'));
 expect(screen.queryByText('GPS 준비')).toBeNull();expect(screen.queryByTestId('run-guidance-mode')).toBeNull();expect(screen.queryByTestId('run-prepare-path')).toBeNull();expect(start).not.toHaveBeenCalled();
 await waitFor(()=>expect(screen.getByTestId('run-simulation-open')).toBeEnabled());await fireEvent.press(screen.getByTestId('run-simulation-open'));expect(mockPush).toHaveBeenCalledWith({pathname:'/run-simulation',params:{courseId:'a'}});expect(start).not.toHaveBeenCalled();
 expect(mockSetParams).toHaveBeenCalledWith({courseId:undefined});
 expect(mockSetParams.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0]);
});
