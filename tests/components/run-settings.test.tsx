import React from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import RunSettingsScreen from '../../src/app/run-settings';
import { Alert } from 'react-native';
let mockParams:any={runId:'a'.repeat(32)};
const mockPreferences=jest.fn(),mockSave=jest.fn(),mockGuidance=jest.fn(),mockOptions=jest.fn(),mockSilence=jest.fn();
jest.mock('expo-router',()=>({router:{back:jest.fn(),replace:jest.fn()},useLocalSearchParams:()=>mockParams,useFocusEffect:(effect:any)=>require('react').useEffect(effect,[effect])}));
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({account:{id:'owner'}})}));
jest.mock('../../src/modules/auth/runtime',()=>({authentication:{getSnapshot:()=>({account:{id:'owner'}})}}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:async()=>({account:{preferences:mockPreferences,savePreferences:mockSave},runs:{guidance:mockGuidance,setGuidanceOptions:mockOptions}})}));
jest.mock('../../src/modules/running/runtime',()=>({running:{finish:jest.fn()}}));
jest.mock('../../src/modules/guidance/native',()=>({guidanceNative:{silenceLive:()=>mockSilence()}}));
beforeEach(()=>{mockParams={runId:'a'.repeat(32)};mockSave.mockClear();mockOptions.mockClear();mockPreferences.mockResolvedValue({theme:'dark',guidance:{mode:'map',voice:true,background:true}});mockGuidance.mockResolvedValue({options:{mode:'focus',voice:true,background:true}});mockSave.mockResolvedValue(undefined);mockOptions.mockResolvedValue(undefined);});
test('settings persist future defaults and the selected live run without changing unrelated options',async()=>{
 await render(<RunSettingsScreen/>);await waitFor(()=>expect(screen.getByTestId('run-voice')).not.toBeDisabled());
 await fireEvent.press(screen.getByTestId('run-voice'));await waitFor(()=>expect(mockOptions).toHaveBeenCalledWith('a'.repeat(32),{mode:'focus',voice:false,background:true}));
 expect(mockSave).toHaveBeenCalledWith({theme:'dark',guidance:{mode:'focus',voice:false,background:true}});expect(mockSilence).toHaveBeenCalledTimes(1);
 await fireEvent.press(screen.getByTestId('run-touch-lock-setting'));await waitFor(()=>expect(mockOptions).toHaveBeenLastCalledWith('a'.repeat(32),{mode:'focus',voice:false,background:true,touchLock:true}));
 await fireEvent.press(screen.getByRole('radio',{name:'지도 모드'}));
 await waitFor(()=>expect(mockOptions).toHaveBeenLastCalledWith('a'.repeat(32),{mode:'map',voice:false,background:true,touchLock:true}));
 expect(screen.queryByTestId('run-background')).toBeNull();
 expect(screen.queryByText('화면 꺼짐 중 안내·기록')).toBeNull();
});
test('failed writes show an error and keep the last confirmed switch state',async()=>{
 mockSave.mockRejectedValueOnce(new Error('disk'));await render(<RunSettingsScreen/>);await waitFor(()=>expect(screen.getByTestId('run-voice')).not.toBeDisabled());
 await fireEvent.press(screen.getByTestId('run-voice'));await waitFor(()=>expect(screen.getByText('설정을 저장하지 못했어요. 다시 시도해 주세요.')).toBeTruthy());
 expect(screen.getByTestId('run-voice')).toBeChecked();
});

test('simulation settings use the same screen without writing account defaults or real runs',async()=>{
 const {simulationSettings}=require('../../src/features/running/simulation-settings');const id=simulationSettings.create('owner',{mode:'map',voice:false,background:false});mockParams={simulation:id};
 await render(<RunSettingsScreen/>);await waitFor(()=>expect(screen.getByTestId('run-voice')).not.toBeDisabled());await fireEvent.press(screen.getByTestId('run-voice'));
 await waitFor(()=>expect(screen.getByTestId('run-voice')).toBeChecked());expect(mockSave).not.toHaveBeenCalled();expect(mockOptions).not.toHaveBeenCalled();expect(simulationSettings.get(id,'owner').options.voice).toBe(true);expect(simulationSettings.get(id,'another-owner')).toBeNull();simulationSettings.clear(id);
});

test('simulation hides background settings and saves mode changes for the return screen',async()=>{
 const {simulationSettings}=require('../../src/features/running/simulation-settings');
 const id=simulationSettings.create('owner',{mode:'map',voice:false,background:true});mockParams={simulation:id};
 await render(<RunSettingsScreen/>);await waitFor(()=>expect(screen.getByTestId('run-voice')).not.toBeDisabled());
 expect(screen.queryByTestId('run-background')).toBeNull();
 expect(screen.queryByText('화면 꺼짐 중 안내·기록')).toBeNull();
 expect(simulationSettings.get(id,'owner').options.background).toBe(false);
 await fireEvent.press(screen.getByRole('radio',{name:'집중 모드'}));
 expect(screen.getByRole('radio',{name:'집중 모드'})).toBeChecked();
 expect(simulationSettings.get(id,'owner').options.mode).toBe('focus');
 expect(mockSave).not.toHaveBeenCalled();expect(mockOptions).not.toHaveBeenCalled();
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 await fireEvent.press(screen.getByText('러닝 종료하기'));
 expect(alert).toHaveBeenCalledWith('시뮬레이션을 종료할까요?','시뮬레이션 기록을 저장하고 종료해요.',expect.any(Array));
 alert.mockRestore();simulationSettings.clear(id);
});

test('failed settings load can be retried without reopening the screen',async()=>{
 mockPreferences.mockRejectedValueOnce(new Error('temporary'));
 await render(<RunSettingsScreen/>);await waitFor(()=>expect(screen.getByText('설정 다시 불러오기')).toBeVisible());
 expect(screen.getByTestId('run-voice')).toBeDisabled();
 await fireEvent.press(screen.getByText('설정 다시 불러오기'));
 await waitFor(()=>expect(screen.getByTestId('run-voice')).not.toBeDisabled());
 expect(screen.queryByText('러닝 설정을 불러오지 못했어요.')).toBeNull();
});
