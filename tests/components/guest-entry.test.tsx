import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import EntryScreen from '../../src/features/membership/EntryScreen';
import { guestAccess } from '../../src/modules/auth/guest-access';
import { GuestMemberNotice } from '../../src/features/auth/GuestMemberNotice';
let mockMode:string|undefined='login';let mockLogoutNotice=0;const mockReplace=jest.fn();
jest.mock('expo-router',()=>({router:{replace:(...args:any[])=>mockReplace(...args)},useLocalSearchParams:()=>({mode:mockMode})}));
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({ready:true,account:null,logoutNotice:mockLogoutNotice,configured:true,busy:false,providers:['kakao','custom:naver','google']})}));
jest.mock('../../src/modules/auth/runtime',()=>({authentication:{signIn:jest.fn()}}));
beforeEach(()=>{guestAccess.leave();mockLogoutNotice=0;mockReplace.mockReset();});
test.each(['login','signup'])('%s guest entry opens browsing without authenticating',async mode=>{
 mockMode=mode;await render(<EntryScreen/>);await fireEvent.press(screen.getByTestId('signup-guest'));
 expect(guestAccess.getSnapshot()).toBe(true);expect(mockReplace).toHaveBeenCalledWith('/');
 if(mode==='signup'){expect(screen.getByText('러닝코스 생성 5회, 저장 10회 무료!',{exact:false})).toBeVisible();expect(screen.getByTestId('signup-free-allowance-policy')).toHaveTextContent('가입 시 1회 제공 · 매월 무료 추가 없음');}
});
test('member tab notice never mounts guest record readers',async()=>{
 const read=jest.fn();function Private(){read();return null;}
 await render(<GuestMemberNotice><Private/></GuestMemberNotice>);expect(read).not.toHaveBeenCalled();expect(screen.getByTestId('guest-member-notice')).toBeVisible();
});

test('a verified logout switches an already mounted signup screen to login without persistent success text',async()=>{
 mockMode=undefined;const view=await render(<EntryScreen/>);expect(screen.getByText('RunPen 회원 가입')).toBeVisible();
 mockLogoutNotice=1;await view.rerender(<EntryScreen/>);expect(screen.getByText('나의 러닝을 작품으로 간직하세요')).toBeVisible();expect(screen.queryByText('RunPen 회원 가입')).toBeNull();expect(screen.queryByTestId('signup-auth-message')).toBeNull();
});
