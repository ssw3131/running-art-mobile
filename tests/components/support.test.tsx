import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Faq from '../../src/app/service-faq';
import Notices from '../../src/app/service-notices';
let mockNotices: any;
const mockRetry=jest.fn(),mockPush=jest.fn();
jest.mock('../../src/features/support/use-notices',()=>({useNotices:()=>({...mockNotices,retry:mockRetry})}));
jest.mock('expo-router',()=>({Stack:{Screen:()=>null},router:{push:(...args:any[])=>mockPush(...args)}}));
beforeEach(()=>{mockNotices={data:null,error:''};mockRetry.mockReset();mockPush.mockReset();});
test('UI-S6-01 FAQ expands actual answers and preserves accessible state',async()=>{
 await render(<Faq/>);expect(screen.getByTestId('faq-about').props.accessibilityState.expanded).toBe(true);
 await fireEvent.press(screen.getByTestId('faq-gps'));expect(screen.getByTestId('faq-gps').props.accessibilityState.expanded).toBe(true);
 expect(screen.getByTestId('faq-about').props.accessibilityState.expanded).toBe(false);
});
test('UI-S6-02 notice loading, failure, empty, cached and published content are distinct',async()=>{
 const view=await render(<Notices/>);expect(screen.queryByTestId('notices-empty')).toBeNull();
 mockNotices={data:null,error:'연결 실패'};await view.rerender(<Notices/>);await fireEvent.press(screen.getByTestId('notices-retry'));expect(mockRetry).toHaveBeenCalled();
 mockNotices={data:{notices:[],offline:false,fetchedAt:1},error:''};await view.rerender(<Notices/>);expect(screen.getByTestId('notices-empty')).toBeVisible();
 mockNotices={data:{notices:[{id:'real',title:'게시된 제목',body:'본문',category:'공지',publishedAt:'2026-10-14T00:00:00Z'}],offline:true,fetchedAt:1},error:''};await view.rerender(<Notices/>);
 expect(screen.getByText(/오프라인 저장본/)).toBeVisible();await fireEvent.press(screen.getByTestId('notice-real'));expect(mockPush).toHaveBeenCalledWith({pathname:'/service-notice',params:{id:'real'}});
});
