import React from 'react';
import {Alert,Clipboard,Share} from 'react-native';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import RunSharePanel from '../../src/features/running/RunSharePanel';
const mockCurrent=jest.fn(),mockPublish=jest.fn();
jest.mock('../../src/modules/auth/runtime',()=>{const snapshot={account:{id:'owner'}};return{authentication:{subscribe:()=>()=>{},getSnapshot:()=>snapshot}};});
jest.mock('../../src/modules/run-sharing/runtime',()=>({runSharing:{current:(...args:any[])=>mockCurrent(...args),publish:(...args:any[])=>mockPublish(...args)}}));
test('copying a route link waits for explicit publication confirmation and never claims delivery',async()=>{
 mockCurrent.mockResolvedValue(null);mockPublish.mockResolvedValue('https://runpen.example/r/test');const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{}),copy=jest.spyOn(Clipboard,'setString').mockImplementation(()=>{}),share=jest.spyOn(Share,'share');
 await render(<RunSharePanel card id="a" disabled={false} onBusy={()=>{}}/>);await waitFor(()=>expect(screen.getByTestId('run-share-copy')).toBeEnabled());await fireEvent.press(screen.getByTestId('run-share-copy'));expect(mockPublish).not.toHaveBeenCalled();
 const buttons=alert.mock.calls.at(-1)![2]!;await act(async()=>{buttons.find(b=>b.text==='공유')!.onPress!();});await waitFor(()=>expect(copy).toHaveBeenCalledWith('https://runpen.example/r/test'));expect(share).not.toHaveBeenCalled();expect(screen.getByText('링크를 복사했어요.')).toBeTruthy();
 alert.mockRestore();copy.mockRestore();share.mockRestore();
});
