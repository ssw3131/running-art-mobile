import React from 'react';
import {act,render,screen} from '@testing-library/react-native';
import {Text} from 'react-native';
import {SavedCourseThumbnail,useSavedCoursePresentation} from '../../src/features/courses/SavedCoursePresentation';
let mockOwner='A';const mockGet=jest.fn();
jest.mock('expo-router',()=>({useFocusEffect:(effect:any)=>require('react').useEffect(effect,[effect])}));
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({account:{id:mockOwner}})}));
jest.mock('../../src/modules/auth/runtime',()=>({authentication:{getSnapshot:()=>({account:{id:mockOwner}})}}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:async()=>({courses:{get:mockGet}})}));
jest.mock('../../src/features/course-generation/use-point-address',()=>({usePointAddress:()=>({address:'서울특별시 종로구 세종대로 175',label:'서울특별시 종로구 세종대로 175'})}));
jest.mock('../../src/features/service/HomePreview',()=>({HomePreview:(props:any)=>require('react').createElement(require('react-native').View,{testID:'course-thumbnail',...props})}));
const snapshot:any={origin:{lat:37,lng:127},source:'osm',route:[[127,37],[127.01,37]]};
function Card(){const p=useSavedCoursePresentation('course');return <><SavedCourseThumbnail snapshot={p.snapshot} failed={p.failed}/><Text>{p.address}</Text></>;}
test('saved thumbnail uses the actual immutable route and omits house number',async()=>{
 mockOwner='A';mockGet.mockResolvedValue({snapshot});await render(<Card/>);
 expect(screen.getByTestId('course-thumbnail').props.paths).toEqual([snapshot.route]);
 expect(screen.getByText('서울특별시 종로구 세종대로')).toBeVisible();
});
test('late previous account snapshot cannot replace the current owner map',async()=>{
 let resolve!:(value:any)=>void;mockOwner='A';mockGet.mockImplementationOnce(()=>new Promise(done=>{resolve=done;})).mockResolvedValue({snapshot:{...snapshot,route:[[128,38],[128.01,38]]}});
 const view=await render(<Card/>);mockOwner='B';await view.rerender(<Card/>);
 await act(async()=>resolve({snapshot}));
 expect(screen.getByTestId('course-thumbnail').props.paths[0][0]).toEqual([128,38]);
});
