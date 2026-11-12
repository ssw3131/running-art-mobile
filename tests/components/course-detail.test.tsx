import React from 'react';
import { Alert, ToastAndroid } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CourseDetailScreen from '../../src/features/courses/CourseDetailScreen';
import { CourseError } from '../../src/modules/courses/model';
import { candidateDrafts } from '../../src/features/course-generation/model';
let mockParams:any, mockLast:any, mockActive:any, mockSaved:any;
const mockPoints=jest.fn().mockResolvedValue([]);
const mockNavigate=jest.fn(),mockSave=jest.fn(),mockGet=jest.fn(),mockExportSnapshot=jest.fn();
const snapshot={schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:3,lengthKm:3,score:80,route:[[127,37],[127.01,37],[127,37]],target:[[127,37],[127.01,37],[127,37]]};
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn]),router:{canGoBack:()=>true,back:jest.fn(),push:jest.fn()}}));
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({ready:true,account:{id:'owner'}})}));
jest.mock('../../src/modules/auth/runtime',()=>({authentication:{getSnapshot:()=>({account:{id:'owner'}})}}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:async()=>({courses:{get:(...args:any[])=>mockGet(...args),findHash:async()=>mockSaved,latestAttempt:async()=>mockLast,save:(...args:any[])=>mockSave(...args)},runs:{points:(...args:any[])=>mockPoints(...args),active:async()=>mockActive,guidance:async()=>({course:{name:'삭제된 코스 사본',snapshot}})}})}));
jest.mock('../../src/modules/courses/share-gpx',()=>({shareCourseGpx:jest.fn(),shareCourseSnapshotGpx:(...args:any[])=>mockExportSnapshot(...args)}));
jest.mock('../../src/features/service/open-service-tab',()=>({openServiceTab:(...args:any[])=>mockNavigate(...args)}));
jest.mock('../../src/modules/map/MapSurface',()=>({__esModule:true,default:(props:any)=>require('react').createElement(require('react-native').View,{testID:'detail-map',...props})}));
jest.mock('../../src/features/terrain/use-terrain',()=>({useTerrain:()=>({state:{status:'idle',profile:null}})}));
jest.mock('../../src/features/terrain/TerrainPanel',()=>()=>null);
jest.mock('../../src/features/usage/use-usage',()=>({useUsage:()=>({data:{generation:{used:2,total:5}},error:'',refresh:jest.fn()})}));
beforeEach(()=>{
 mockPoints.mockReset().mockResolvedValue([]);candidateDrafts.clear();jest.spyOn(ToastAndroid,'show').mockImplementation(()=>{});
 mockParams={id:'a'.repeat(32)};mockLast=null;mockActive=null;mockSaved='a'.repeat(32);
 mockGet.mockReset().mockResolvedValue({id:mockSaved,name:'저장 하트',snapshot});mockSave.mockReset().mockResolvedValue({id:'b'.repeat(32),created:true});mockNavigate.mockReset();mockExportSnapshot.mockReset().mockResolvedValue('closed');
});
test('unsaved candidate name survives leaving detail and reopening without using a save',async()=>{
 mockSaved=null;const id=candidateDrafts.put(snapshot as any,0,'owner');mockParams={draft:id};
 const view=await render(<CourseDetailScreen/>);await waitFor(()=>screen.getByTestId('course-edit-name'));
 expect(screen.queryByTestId('course-save-name')).toBeNull();
 await fireEvent.press(screen.getByTestId('course-edit-name'));
 await fireEvent.changeText(screen.getByTestId('course-rename-input'),'내 새 코스');await fireEvent.press(screen.getByText('이름 적용'));await view.unmount();
 await render(<CourseDetailScreen/>);await waitFor(()=>expect(screen.getByTestId('course-title')).toHaveTextContent('내 새 코스'));
 expect(mockSave).not.toHaveBeenCalled();
});
test('saved course starts without saving again, unfinished active session returns to that run',async()=>{
 const view=await render(<CourseDetailScreen/>);
 await waitFor(()=>expect(screen.getByTestId('course-run')).toHaveTextContent('실시간 러닝 시작하기'));
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
 expect(mockSave).not.toHaveBeenCalled();expect(screen.getByTestId('course-run')).toBeEnabled();
 await fireEvent.press(screen.getByTestId('course-save'));await waitFor(()=>expect(screen.getByTestId('course-run')).toBeTruthy());
 expect(mockSave).toHaveBeenCalledTimes(1);expect(screen.getByTestId('course-save')).toHaveTextContent('저장된 코스');
 expect(ToastAndroid.show).toHaveBeenCalledWith('해당 코스가 코스 보관함에 저장 되었습니다.',ToastAndroid.LONG);
});

test('unsaved run saves once then navigates; a failed save never starts running',async()=>{
 mockSaved=null;mockParams={draft:candidateDrafts.put(snapshot as any,1,'owner')};
 await render(<CourseDetailScreen/>);await waitFor(()=>screen.getByTestId('course-run'));
 await fireEvent.press(screen.getByTestId('course-run'));
 await waitFor(()=>expect(mockNavigate).toHaveBeenCalledWith({pathname:'/run',params:{courseId:'b'.repeat(32)}}));
 expect(mockSave).toHaveBeenCalledTimes(1);
});
test('save failure keeps the draft and does not navigate to running',async()=>{
 mockSaved=null;const id=candidateDrafts.put(snapshot as any,1,'owner');mockParams={draft:id};mockSave.mockRejectedValue(new CourseError('validation','저장 실패'));
 await render(<CourseDetailScreen/>);await waitFor(()=>screen.getByTestId('course-run'));
 await fireEvent.press(screen.getByTestId('course-run'));
 await waitFor(()=>expect(screen.getByTestId('course-detail-error')).toHaveTextContent('저장 실패'));
 expect(mockNavigate).not.toHaveBeenCalled();expect(candidateDrafts.get(id,'owner')?.savedId).toBeUndefined();
});
test('unsaved GPX export does not save or spend allowance',async()=>{
 mockSaved=null;mockParams={draft:candidateDrafts.put(snapshot as any,1,'owner')};
 await render(<CourseDetailScreen/>);await waitFor(()=>screen.getByTestId('course-export-gpx'));
 await fireEvent.press(screen.getByTestId('course-export-gpx'));
 await waitFor(()=>expect(mockExportSnapshot).toHaveBeenCalledWith(snapshot,'하트 코스',expect.anything()));expect(mockSave).not.toHaveBeenCalled();
});
test('reset warning cancels safely and confirms clearing only transient unsaved candidates',async()=>{
 mockSaved=null;const unsaved=candidateDrafts.put(snapshot as any,1,'owner');mockParams={draft:unsaved};
 const saved=candidateDrafts.put({...snapshot,targetKm:4} as any,2,'owner');candidateDrafts.edit(saved,'owner',{savedId:'saved'});
 await render(<CourseDetailScreen/>);await waitFor(()=>screen.getByTestId('course-reset'));
 await fireEvent.press(screen.getByTestId('course-reset'));
 expect(screen.getByText('추천 코스를 삭제하고\n재생성할까요?')).toBeVisible();
 expect(candidateDrafts.get(unsaved,'owner')).not.toBeNull();expect(mockNavigate).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByText('취소'));
 expect(candidateDrafts.get(unsaved,'owner')).not.toBeNull();
 await fireEvent.press(screen.getByTestId('course-reset'));
 await fireEvent.press(screen.getByTestId('regeneration-confirm'));
 expect(candidateDrafts.get(unsaved,'owner')).toBeNull();expect(candidateDrafts.get(saved,'owner')).not.toBeNull();expect(mockSave).not.toHaveBeenCalled();
});

test('difficulty criteria stay expanded and terrain opens the same private snapshot without saving',async()=>{
 const {router}=require('expo-router');router.push.mockClear();
 await render(<CourseDetailScreen/>);await waitFor(()=>screen.getByTestId('course-terrain-open'));
 expect(screen.getByTestId('course-difficulty-content')).toBeVisible();
 expect(screen.queryByTestId('course-save-name')).toBeNull();
 await fireEvent.press(screen.getByTestId('course-terrain-open'));
 const destination=router.push.mock.lastCall[0];expect(destination.pathname).toBe('/course-terrain');
 expect(candidateDrafts.get(destination.params.draft,'owner')?.snapshot).toEqual(snapshot);
 expect(candidateDrafts.get(destination.params.draft,'other')).toBeNull();
 expect(mockSave).not.toHaveBeenCalled();
 expect(screen.getByTestId('course-export-gpx')).toHaveTextContent('GPX파일 다운');
});

test('unfinished saved detail shows the latest owned run segments over its full course without resuming',async()=>{
 mockLast={id:'r'.repeat(32),status:'completed',courseOutcome:'stopped',startedAt:1};
 mockPoints.mockResolvedValue([{segment:0,longitude:127,latitude:37},{segment:0,longitude:127.001,latitude:37},{segment:1,longitude:127.002,latitude:37}]);
 await render(<CourseDetailScreen/>);await waitFor(()=>expect(screen.getByTestId('detail-map').props.recordedPaths).toEqual([[[127,37],[127.001,37]],[[127.002,37]]]));
 expect(mockPoints).toHaveBeenCalledWith(mockLast.id);expect(mockNavigate).not.toHaveBeenCalled();
});
