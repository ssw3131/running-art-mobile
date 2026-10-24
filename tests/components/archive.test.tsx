import React from 'react';
import { act,fireEvent,render,screen } from '@testing-library/react-native';
import CoursesScreen from '../../src/features/courses/CoursesScreen';
import { getStorage } from '../../src/modules/storage/database';
let mockOwner:string|null=null;
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({ready:true,account:mockOwner?{id:mockOwner}:null})}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:jest.fn()}));
jest.mock('../../src/features/usage/use-usage',()=>({useUsage:()=>({data:{version:1,generation:{used:2,total:5},save:{used:5,total:15}},error:'',refresh:jest.fn()})}));
const row=(i:number)=>({id:String(i),name:'코스 '+i,shape:'heart',lengthKm:5,createdAt:1,source:'osm'});
beforeEach(()=>{mockOwner=null;});
test('UI-ARCHIVE-01: page size boundary has explicit more and retains existing courses',async()=>{
 const list=jest.fn().mockResolvedValueOnce(Array.from({length:31},(_,i)=>row(i))).mockResolvedValueOnce([row(30)]);
 jest.mocked(getStorage).mockResolvedValue({courses:{recover:async()=>{},list,count:async()=>31},runs:{active:async()=>null}} as any);
 await render(<CoursesScreen embedded/>);expect(screen.getByTestId('course-row-29')).toBeVisible();expect(screen.queryByTestId('course-row-30')).toBeNull();
 await fireEvent.press(screen.getByText('더 보기'));expect(screen.getByTestId('course-row-30')).toBeVisible();expect(screen.getByTestId('course-row-0')).toBeVisible();expect(list).toHaveBeenLastCalledWith(31,30);
});
test('UI-ARCHIVE-02: account transition suppresses old pending page and its error',async()=>{
 let finish!:(rows:any[])=>void;const list=jest.fn().mockImplementationOnce(()=>new Promise(r=>{finish=r;})).mockResolvedValueOnce([row(99)]);
 jest.mocked(getStorage).mockResolvedValue({courses:{recover:async()=>{},list,count:async()=>1},runs:{active:async()=>null}} as any);
 await render(<CoursesScreen embedded/>);mockOwner='new-account';await screen.rerender(<CoursesScreen embedded/>);expect(screen.getByTestId('course-row-99')).toBeVisible();
 await act(async()=>finish([row(1)]));expect(screen.queryByTestId('course-row-1')).toBeNull();expect(screen.getByTestId('course-row-99')).toBeVisible();
});
