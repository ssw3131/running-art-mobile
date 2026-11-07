import React from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import SavedCourseChooser from '../../src/features/running/SavedCourseChooser';
const mockList=jest.fn(),mockNavigate=jest.fn(),mockParams=jest.fn();
jest.mock('expo-router',()=>({router:{setParams:(p:any)=>mockParams(p)},useFocusEffect:(effect:any)=>require('react').useEffect(effect,[effect])}));
jest.mock('../../src/features/service/open-service-tab',()=>({openServiceTab:(p:any)=>mockNavigate(p)}));
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({account:{id:'owner'}})}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:async()=>({courses:{list:mockList}})}));
test('saved courses keep unfinished status, select without starting GPS, and create CTA reaches generation',async()=>{
 mockList.mockResolvedValue([{id:'a'.repeat(32),name:'나의 하트',shape:'heart',lengthKm:3,unfinished:true}]);
 const start=jest.fn();await render(<SavedCourseChooser onFreeStart={start} busy={false}/>);
 await waitFor(()=>expect(screen.getByTestId('run-in-progress-'+'a'.repeat(32))).toHaveTextContent('진행중'));
 await fireEvent.press(screen.getByTestId('run-saved-course-'+'a'.repeat(32)));expect(mockParams).toHaveBeenCalledWith({courseId:'a'.repeat(32)});expect(start).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByText('코스 생성하기'));expect(mockNavigate).toHaveBeenCalledWith('/route-lab');
});
