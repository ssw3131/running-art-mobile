import React from 'react';
import * as WebBrowser from 'expo-web-browser';
jest.mock('expo-web-browser',()=>({openBrowserAsync:jest.fn()}));
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

test('webpage opens the existing shared URL without republishing and the full address is displayed',async()=>{
 const url='https://runpen.example/#r/'+'a'.repeat(64);mockCurrent.mockResolvedValue(url);mockPublish.mockClear();const open=jest.spyOn(WebBrowser,'openBrowserAsync').mockResolvedValue({type:'dismiss'});
 await render(<RunSharePanel card="platform" id="b" disabled={false} onBusy={()=>{}} previewContent={{title:'코스',outcome:'완주',pathLabel:'경로',distance:'3km',duration:'18:00',pace:'6:00'}}/>);
 await waitFor(()=>expect(screen.getByTestId('share-webpage')).toBeEnabled());expect(screen.getByTestId('run-share-url')).toHaveTextContent(url);
 await fireEvent.press(screen.getByTestId('share-webpage'));await waitFor(()=>expect(open).toHaveBeenCalledWith(url));expect(mockPublish).not.toHaveBeenCalled();open.mockRestore();
});

test('selecting link sharing prepares a new real URL before copy or opening, without an extra publication dialog',async()=>{
 const url='https://runpen.example/#r/'+'e'.repeat(64);mockCurrent.mockResolvedValue(null);mockPublish.mockResolvedValue(url);const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{}),open=jest.spyOn(WebBrowser,'openBrowserAsync').mockResolvedValue({type:'dismiss'});
 await render(<RunSharePanel card="platform" id="c" disabled={false} onBusy={()=>{}} previewContent={{title:'코스',outcome:'완주',pathLabel:'경로',distance:'3km',duration:'18:00',pace:'6:00'}}/>);
 await waitFor(()=>expect(screen.getByTestId('run-share-url')).toHaveTextContent(url));expect(screen.queryByText('공유될 링크 미리보기')).toBeNull();await fireEvent.press(screen.getByTestId('share-webpage'));await waitFor(()=>expect(open).toHaveBeenCalledWith(url));expect(alert).not.toHaveBeenCalled();alert.mockRestore();open.mockRestore();
});
