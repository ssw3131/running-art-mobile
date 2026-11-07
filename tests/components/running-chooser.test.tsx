import React from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import SavedCourseChooser from '../../src/features/running/SavedCourseChooser';
const mockList=jest.fn(),mockNavigate=jest.fn(),mockParams=jest.fn(),mockPush=jest.fn();
jest.mock('expo-router',()=>({router:{push:(p:any)=>mockPush(p),setParams:(p:any)=>mockParams(p)},useFocusEffect:(effect:any)=>require('react').useEffect(effect,[effect])}));
jest.mock('../../src/features/service/open-service-tab',()=>({openServiceTab:(p:any)=>mockNavigate(p)}));
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({account:{id:'owner'}})}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:async()=>({courses:{list:mockList}})}));
test('saved courses keep unfinished status, select without starting GPS, and create CTA reaches generation',async()=>{
 mockList.mockResolvedValue([{id:'a'.repeat(32),name:'나의 하트',shape:'heart',lengthKm:3,unfinished:true}]);
 await render(<SavedCourseChooser busy={false}/>);
 await waitFor(()=>expect(screen.getByTestId('run-in-progress-'+'a'.repeat(32))).toHaveTextContent('진행중'));
 expect(screen.getByTestId('run-selected-start')).toBeDisabled();
 await fireEvent.press(screen.getByTestId('run-saved-course-'+'a'.repeat(32)));expect(mockParams).not.toHaveBeenCalled();expect(screen.getByTestId('run-selected-start')).toBeEnabled();
 await fireEvent.press(screen.getByTestId('run-course-detail-'+'a'.repeat(32)));expect(mockPush).toHaveBeenCalledWith({pathname:'/courses/[id]',params:{id:'a'.repeat(32)}});expect(mockParams).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByTestId('run-selected-start'));expect(mockParams).toHaveBeenCalledWith({courseId:'a'.repeat(32)});expect(screen.queryByText('자유 러닝 시작')).toBeNull();
 await fireEvent.press(screen.getByText('새로운 코스 생성하기'));expect(mockNavigate).toHaveBeenCalledWith('/route-lab');
});
