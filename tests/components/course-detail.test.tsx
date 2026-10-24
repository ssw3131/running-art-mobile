import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CourseDetailScreen from '../../src/features/courses/CourseDetailScreen';
import { CourseError } from '../../src/modules/courses/model';
let mockParams:any, mockLast:any, mockActive:any, mockSaved:any;
const mockNavigate=jest.fn(),mockSave=jest.fn(),mockGet=jest.fn();
const snapshot={schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:3,lengthKm:3,score:80,route:[[127,37],[127.01,37],[127,37]],target:[[127,37],[127.01,37],[127,37]]};
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn]),router:{canGoBack:()=>true,back:jest.fn()}}));
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({ready:true,account:{id:'owner'}})}));
jest.mock('../../src/modules/auth/runtime',()=>({authentication:{getSnapshot:()=>({account:{id:'owner'}})}}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:async()=>({courses:{get:(...args:any[])=>mockGet(...args),findHash:async()=>mockSaved,latestAttempt:async()=>mockLast,save:(...args:any[])=>mockSave(...args)},runs:{active:async()=>mockActive,guidance:async()=>({course:{name:'삭제된 코스 사본',snapshot}})}})}));
jest.mock('../../src/modules/courses/share-gpx',()=>({shareCourseGpx:jest.fn()}));
jest.mock('../../src/features/service/open-service-tab',()=>({openServiceTab:(...args:any[])=>mockNavigate(...args)}));
jest.mock('../../src/modules/map/MapSurface',()=>()=>null);
jest.mock('../../src/features/terrain/use-terrain',()=>({useTerrain:()=>({state:{status:'idle',profile:null}})}));
jest.mock('../../src/features/terrain/TerrainPanel',()=>()=>null);
beforeEach(()=>{
 mockParams={id:'a'.repeat(32)};mockLast=null;mockActive=null;mockSaved='a'.repeat(32);
 mockGet.mockReset().mockResolvedValue({id:mockSaved,name:'저장 하트',snapshot});mockSave.mockReset().mockResolvedValue({id:'b'.repeat(32),created:true});mockNavigate.mockReset();
});
test('saved course starts without saving again, unfinished active session returns to that run',async()=>{
 const view=await render(<CourseDetailScreen/>);
 await waitFor(()=>expect(screen.getByTestId('course-run')).toHaveTextContent('이 코스 러닝 시작하기'));
 await fireEvent.press(screen.getByTestId('course-run'));await waitFor(()=>expect(mockNavigate).toHaveBeenCalledWith({pathname:'/run',params:{courseId:mockSaved}}));
 expect(mockSave).not.toHaveBeenCalled();await view.unmount();
 mockLast={id:'session',status:'paused',courseOutcome:'active'};mockActive={id:'session'};
 await render(<CourseDetailScreen/>);await waitFor(()=>expect(screen.getByTestId('course-run')).toHaveTextContent('이 코스 러닝 이어하기'));
 await fireEvent.press(screen.getByTestId('course-run'));await waitFor(()=>expect(mockNavigate).toHaveBeenLastCalledWith('/run'));expect(mockSave).not.toHaveBeenCalled();
});
test('ended unfinished attempt explains new challenge; another active run cannot be replaced',async()=>{
 const alert=jest.spyOn(Alert,'alert');mockLast={id:'ended',status:'completed',courseOutcome:'stopped'};
 const view=await render(<CourseDetailScreen/>);await waitFor(()=>screen.getByTestId('course-run'));
 await fireEvent.press(screen.getByTestId('course-run'));await waitFor(()=>expect(alert).toHaveBeenCalledWith('새 도전을 시작할까요?','이전 러닝은 종료되어 새 도전으로 시작합니다.',expect.any(Array)));
 expect(mockNavigate).not.toHaveBeenCalled();await view.unmount();mockActive={id:'other'};
 await render(<CourseDetailScreen/>);await waitFor(()=>screen.getByTestId('course-run'));await fireEvent.press(screen.getByTestId('course-run'));
 await waitFor(()=>expect(alert).toHaveBeenLastCalledWith('진행 중인 러닝이 있어요',expect.any(String),expect.any(Array)));expect(mockSave).not.toHaveBeenCalled();alert.mockRestore();
});
test('deleted original opens immutable copy without saving; explicit save switches the same screen',async()=>{
 mockParams={id:'a'.repeat(32),runId:'run'};mockSaved=null;mockGet.mockRejectedValue(new CourseError('missing','없음'));
 await render(<CourseDetailScreen/>);await waitFor(()=>expect(screen.getByTestId('course-title')).toHaveTextContent('삭제된 코스 사본'));
 expect(mockSave).not.toHaveBeenCalled();expect(screen.queryByTestId('course-run')).toBeNull();
 await fireEvent.press(screen.getByTestId('course-save'));await waitFor(()=>expect(screen.getByTestId('course-run')).toBeTruthy());
 expect(mockSave).toHaveBeenCalledTimes(1);expect(screen.queryByTestId('course-save')).toBeNull();
});
