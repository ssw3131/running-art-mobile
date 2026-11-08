import React from 'react';
import { Alert,StyleSheet } from 'react-native';
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react-native';
import { badgeProgress } from '../../src/modules/achievements/catalog';
import BadgeGalleryScreen from '../../src/features/achievements/BadgeGalleryScreen';
import BadgeDetailScreen from '../../src/features/achievements/BadgeDetailScreen';
let mockParams:any={},mockData:any;
const mockPush=jest.fn(),mockRetry=jest.fn(),mockRemove=jest.fn();
jest.mock('expo-router',()=>({router:{push:(...args:any[])=>mockPush(...args)},useLocalSearchParams:()=>mockParams,useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn])}));
jest.mock('../../src/features/achievements/AchievementPage',()=>({AchievementPage:({children}:any)=>require('react').createElement(require('react-native').View,null,children)}));
jest.mock('../../src/features/achievements/use-badge-gallery',()=>({useBadgeGallery:()=>({data:mockData,error:'',retry:mockRetry})}));
jest.mock('../../src/features/achievements/RegionText',()=>({RegionText:()=>null}));
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({ready:true,account:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}})}));
jest.mock('../../src/modules/auth/runtime',()=>({authentication:{getSnapshot:()=>({account:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}})}}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:async()=>({runs:{remove:(...args:any[])=>mockRemove(...args)}})}));
jest.mock('../../src/modules/achievements/image-file',()=>({retainCard:jest.fn(),shareCardFile:jest.fn()}));
jest.mock('../../src/features/service/open-service-tab',()=>({openServiceTab:jest.fn()}));
const record=(id:string,extra:any={})=>({id,status:'completed',startedAt:1800000000000,distanceM:3000,activeMs:900000,courseId:'course',courseOutcome:'finished',shape:'heart',courseName:'test',targetKm:3,courseHash:'same',region:null,reason:null,originLat:37,originLng:127,...extra});
const data=(records:any[])=>({records,badges:badgeProgress(records),summary:{}});
beforeEach(()=>{mockParams={};mockData=data([]);mockPush.mockReset();mockRetry.mockReset();mockRemove.mockReset().mockResolvedValue(undefined);});
test('the entire gallery starts gray and disabled; earned badges alone navigate to their badge details',async()=>{
 const view=await render(<BadgeGalleryScreen/>);
 expect(screen.getByTestId('gallery-badge-heart')).toBeDisabled();expect(screen.getByTestId('gallery-badge-time-500')).toBeDisabled();
 expect(StyleSheet.flatten(screen.getByTestId('badge-image-heart').props.style).filter).toEqual([{grayscale:1}]);
 await fireEvent.press(screen.getByTestId('gallery-badge-heart'));expect(mockPush).not.toHaveBeenCalled();
 mockData=data([record('1')]);await view.rerender(<BadgeGalleryScreen/>);
 expect(screen.getByTestId('gallery-badge-heart')).toBeEnabled();expect(screen.getByTestId('gallery-badge-star')).toBeDisabled();
 await fireEvent.press(screen.getByTestId('gallery-badge-heart'));expect(mockPush).toHaveBeenCalledWith({pathname:'/badge-detail',params:{id:'heart'}});
});
test('challenge tab opens pending goals separately from the disabled earned gallery',async()=>{
 await render(<BadgeGalleryScreen/>);await fireEvent.press(screen.getByTestId('badge-tab-challenges'));
 expect(screen.getByTestId('badge-challenges')).toBeVisible();
 await fireEvent.press(screen.getByTestId('challenge-animals'));
 expect(mockPush).toHaveBeenCalledWith({pathname:'/badge-detail',params:{id:'animals',challenge:'1'}});
});
test('pending category details show actual finished shapes and never expose earned sharing',async()=>{
 mockParams={id:'animals',challenge:'1'};mockData=data([record('1',{shape:'fish'}),record('2',{shape:'whale'})]);
 await render(<BadgeDetailScreen/>);
 expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({min:0,max:5,now:2});
 expect(screen.getAllByText('완주')).toHaveLength(2);expect(screen.getAllByText('미완주')).toHaveLength(3);
 expect(screen.queryByTestId('badge-share')).toBeNull();expect(mockRemove).not.toHaveBeenCalled();
});
test('an earned badge deletion requires an explicit record selection and destructive confirmation',async()=>{
 const first=record('1'.repeat(32)),second=record('2'.repeat(32),{startedAt:1800000001000});mockParams={id:'heart'};mockData=data([first,second]);
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 await render(<BadgeDetailScreen/>);await fireEvent.press(screen.getByTestId('badge-delete-records'));
 expect(mockRemove).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'선택한 기록 0개 삭제'})).toBeDisabled();
 await fireEvent.press(screen.getByTestId('badge-delete-record-'+first.id));
 await fireEvent.press(screen.getByRole('button',{name:'선택한 기록 1개 삭제'}));
 expect(mockRemove).not.toHaveBeenCalled();expect(alert).toHaveBeenCalledWith('선택한 러닝 기록을 삭제할까요?',expect.stringContaining('1개'),expect.any(Array));
 await act(async()=>{alert.mock.lastCall?.[2]?.find(b=>b.text==='기록 삭제')?.onPress?.();});
 await waitFor(()=>expect(mockRemove).toHaveBeenCalledTimes(1));expect(mockRemove).toHaveBeenCalledWith(first.id);expect(mockRetry).toHaveBeenCalled();alert.mockRestore();
});
test('opening and cancelling the badge share preview never transmits or captures anything',async()=>{
 mockParams={id:'heart'};mockData=data([record('1')]);
 const {shareCardFile}=require('../../src/modules/achievements/image-file');
 await render(<BadgeDetailScreen/>);await fireEvent.press(screen.getByTestId('badge-share'));
 expect(screen.getByText('뱃지 공유')).toBeVisible();expect(screen.getByRole('button',{name:'공유하기'})).toBeDisabled();
 await fireEvent.press(screen.getByRole('button',{name:'취소'}));expect(screen.queryByText('뱃지 공유')).toBeNull();expect(shareCardFile).not.toHaveBeenCalled();expect(mockRemove).not.toHaveBeenCalled();
});

test('variation challenges list the actual qualifying records without a category progress card',async()=>{
 mockParams={id:'distance-variation',challenge:'1'};mockData=data([record('1'),record('2',{targetKm:5})]);
 await render(<BadgeDetailScreen/>);expect(screen.queryByRole('progressbar')).toBeNull();
 expect(screen.getByTestId('badge-record-1')).toBeVisible();expect(screen.getByTestId('badge-record-2')).toBeVisible();expect(screen.queryByTestId('badge-share')).toBeNull();
});
