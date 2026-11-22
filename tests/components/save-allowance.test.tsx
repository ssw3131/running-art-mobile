import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Button } from '../../src/components/ui';
import { useSaveAllowance } from '../../src/features/usage/use-save-allowance';
import { AllowanceError, exhaustedMessage } from '../../src/modules/usage/model';
let mockOwner='owner',mockExisting:string|null=null;
const mockRead=jest.fn(),mockCommit=jest.fn(),mockPush=jest.fn();
const snapshot={schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:3,lengthKm:3,score:80,route:[[127,37],[127.01,37],[127,37]],target:[[127,37],[127.01,37],[127,37]]};
jest.mock('../../src/features/auth/use-auth',()=>({useAuth:()=>({account:{id:mockOwner}})}));
jest.mock('../../src/modules/auth/runtime',()=>({authentication:{getSnapshot:()=>({account:{id:mockOwner}})}}));
jest.mock('../../src/modules/storage/database',()=>({getStorage:async()=>({courses:{findHash:async()=>mockExisting}})}));
jest.mock('../../src/modules/usage/runtime',()=>({readUsage:()=>mockRead()}));
jest.mock('expo-router',()=>({router:{push:(path:string)=>mockPush(path)},useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn])}));
function Harness(){const gate=useSaveAllowance(snapshot as any,false,mockCommit);return <><Button testID="save" label="저장" disabled={gate.busy} onPress={()=>gate.request()}/>{gate.sheets}</>;}
beforeEach(()=>{mockOwner='owner';mockExisting=null;mockRead.mockReset().mockResolvedValue({version:1,generation:{used:0,total:5},save:{used:3,total:10}});mockCommit.mockReset().mockResolvedValue(undefined);jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());
test('consent displays actual remaining counts; cancel does not save; repeated confirm saves once',async()=>{
 await render(<Harness/>);await fireEvent.press(screen.getByTestId('save'));await waitFor(()=>screen.getByTestId('save-allowance-confirm'));
 expect(screen.getByTestId('save-allowance-remaining')).toHaveTextContent('7회');expect(screen.getByTestId('save-allowance-after')).toHaveTextContent('6회');
 expect(mockCommit).not.toHaveBeenCalled();await fireEvent.press(screen.getByText('취소'));expect(mockCommit).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByTestId('save'));await waitFor(()=>screen.getByTestId('save-allowance-confirm'));
 await fireEvent.press(screen.getByTestId('save-allowance-confirm'));expect(mockCommit).toHaveBeenCalledTimes(1);
});
test('exhausted accounts see add notice and cannot save; adding opens the prepared packs',async()=>{
 mockRead.mockResolvedValue({version:1,generation:{used:0,total:5},save:{used:10,total:10}});
 await render(<Harness/>);await fireEvent.press(screen.getByTestId('save'));await waitFor(()=>screen.getByTestId('allowance-add-save'));
 expect(screen.queryByTestId('save-allowance-confirm')).toBeNull();await fireEvent.press(screen.getByTestId('allowance-add-save'));
 expect(mockPush).toHaveBeenCalledWith('/packs');expect(mockCommit).not.toHaveBeenCalled();expect(screen.queryByTestId('allowance-add-save')).toBeNull();
});
test('duplicate owned course bypasses consent and online quota check',async()=>{
 mockExisting='saved';mockRead.mockRejectedValue(Error('offline'));
 await render(<Harness/>);await fireEvent.press(screen.getByTestId('save'));await waitFor(()=>expect(mockCommit).toHaveBeenCalledTimes(1));expect(mockRead).not.toHaveBeenCalled();
});
test('account switch discards a late quota response without saving or showing consent',async()=>{
 let finish:any;mockRead.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const view=await render(<Harness/>);
 await fireEvent.press(screen.getByTestId('save'));await waitFor(()=>expect(mockRead).toHaveBeenCalled());
 mockOwner='other';await view.rerender(<Harness/>);await act(async()=>finish({version:1,save:{used:0,total:10},generation:{used:0,total:5}}));
 expect(screen.queryByTestId('save-allowance-confirm')).toBeNull();expect(mockCommit).not.toHaveBeenCalled();
});
test('offline status never invents a balance or saves',async()=>{
 mockRead.mockRejectedValue(Error('offline'));await render(<Harness/>);await fireEvent.press(screen.getByTestId('save'));
 await waitFor(()=>expect(Alert.alert).toHaveBeenCalledWith('코스를 저장하지 못했어요','offline'));expect(mockCommit).not.toHaveBeenCalled();expect(screen.queryByTestId('save-allowance-confirm')).toBeNull();
});
test('server exhaustion after consent refreshes exhausted notice instead of reporting success',async()=>{
 await render(<Harness/>);await fireEvent.press(screen.getByTestId('save'));await waitFor(()=>screen.getByTestId('save-allowance-confirm'));
 mockCommit.mockRejectedValue(new AllowanceError(exhaustedMessage));mockRead.mockResolvedValue({version:2,generation:{used:0,total:5},save:{used:10,total:10}});
 await fireEvent.press(screen.getByTestId('save-allowance-confirm'));await waitFor(()=>screen.getByText('코스 저장 횟수를 모두 사용했어요'));expect(mockCommit).toHaveBeenCalledTimes(1);
});
