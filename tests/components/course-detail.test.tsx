import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CourseDetailScreen from '../../src/features/courses/CourseDetailScreen';
import { CourseError } from '../../src/modules/courses/model';
import { candidateDrafts } from '../../src/features/course-generation/model';
let mockParams:any, mockLast:any, mockActive:any, mockSaved:any;
const mockNavigate=jest.fn(),mockSave=jest.fn(),mockGet=jest.fn(),mockExportSnapshot=jest.fn();
const snapshot={schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:3,lengthKm:3,score:80,route:[[127,37],[127.01,37],[127,37]],target:[[127,37],[127.01,37],[127,37]]};
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn]),router:{canGoBack:()=>true,back:jest.fn(),push:jest.fn()}}));
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({ready:true,account:{id:'owner'}})}));
jest.mock('../../src/modules/auth/runtime',()=>({authentication:{getSnapshot:()=>({account:{id:'owner'}})}}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:async()=>({courses:{get:(...args:any[])=>mockGet(...args),findHash:async()=>mockSaved,latestAttempt:async()=>mockLast,save:(...args:any[])=>mockSave(...args)},runs:{active:async()=>mockActive,guidance:async()=>({course:{name:'삭제된 코스 사본',snapshot}})}})}));
jest.mock('../../src/modules/courses/share-gpx',()=>({shareCourseGpx:jest.fn(),shareCourseSnapshotGpx:(...args:any[])=>mockExportSnapshot(...args)}));
jest.mock('../../src/features/service/open-service-tab',()=>({openServiceTab:(...args:any[])=>mockNavigate(...args)}));
jest.mock('../../src/modules/map/MapSurface',()=>()=>null);
jest.mock('../../src/features/terrain/use-terrain',()=>({useTerrain:()=>({state:{status:'idle',profile:null}})}));
jest.mock('../../src/features/terrain/TerrainPanel',()=>()=>null);
beforeEach(()=>{
 candidateDrafts.clear();
 mockParams={id:'a'.repeat(32)};mockLast=null;mockActive=null;mockSaved='a'.repeat(32);
 mockGet.mockReset().mockResolvedValue({id:mockSaved,name:'저장 하트',snapshot});mockSave.mockReset().mockResolvedValue({id:'b'.repeat(32),created:true});mockNavigate.mockReset();mockExportSnapshot.mockReset().mockResolvedValue('closed');
});
test('unsaved candidate name survives leaving detail and reopening without using a save',async()=>{
 mockSaved=null;const id=candidateDrafts.put(snapshot as any,0,'owner');mockParams={draft:id};
 const view=await render(<CourseDetailScreen/>);await waitFor(()=>screen.getByTestId('course-save-name'));
 await fireEvent.changeText(screen.getByTestId('course-save-name'),'내 새 코스');await view.unmount();
 await render(<CourseDetailScreen/>);await waitFor(()=>expect(screen.getByTestId('course-save-name').props.value).toBe('내 새 코스'));
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
 const alert=jest.spyOn(Alert,'alert');mockSaved=null;const unsaved=candidateDrafts.put(snapshot as any,1,'owner');mockParams={draft:unsaved};
 const saved=candidateDrafts.put({...snapshot,targetKm:4} as any,2,'owner');candidateDrafts.edit(saved,'owner',{savedId:'saved'});
 await render(<CourseDetailScreen/>);await waitFor(()=>screen.getByTestId('course-reset'));
 await fireEvent.press(screen.getByTestId('course-reset'));
 const buttons=alert.mock.lastCall?.[2];expect(alert.mock.lastCall?.[1]).toBe('현재 생성된 코스중 저장하지 않은 코스는 삭제됩니다.');
 expect(candidateDrafts.get(unsaved,'owner')).not.toBeNull();expect(mockNavigate).not.toHaveBeenCalled();
 await buttons?.find(x=>x.text==='확인')?.onPress?.();
 expect(candidateDrafts.get(unsaved,'owner')).toBeNull();expect(candidateDrafts.get(saved,'owner')).not.toBeNull();expect(mockSave).not.toHaveBeenCalled();alert.mockRestore();
});
