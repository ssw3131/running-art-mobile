import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import EntryScreen from '../../src/features/membership/EntryScreen';
import { guestAccess } from '../../src/modules/auth/guest-access';
import { GuestMemberNotice } from '../../src/features/auth/GuestMemberNotice';
let mockMode='login';const mockReplace=jest.fn();
jest.mock('expo-router',()=>({router:{replace:(...args:any[])=>mockReplace(...args)},useLocalSearchParams:()=>({mode:mockMode})}));
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({ready:true,account:null,configured:true,busy:false,providers:['kakao','custom:naver','google']})}));
jest.mock('../../src/modules/auth/runtime',()=>({authentication:{signIn:jest.fn()}}));
beforeEach(()=>{guestAccess.leave();mockReplace.mockReset();});
test.each(['login','signup'])('%s guest entry opens browsing without authenticating',async mode=>{
 mockMode=mode;await render(<EntryScreen/>);await fireEvent.press(screen.getByTestId('signup-guest'));
 expect(guestAccess.getSnapshot()).toBe(true);expect(mockReplace).toHaveBeenCalledWith('/');
 if(mode==='signup')expect(screen.getByText('러닝코스 생성 5회 무료!',{exact:false})).toBeVisible();
});
test('member tab notice never mounts guest record readers',async()=>{
 const read=jest.fn();function Private(){read();return null;}
 await render(<GuestMemberNotice><Private/></GuestMemberNotice>);expect(read).not.toHaveBeenCalled();expect(screen.getByTestId('guest-member-notice')).toBeVisible();
});
