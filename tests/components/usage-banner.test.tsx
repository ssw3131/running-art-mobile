import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { UsagePanel } from '../../src/features/usage/UsagePanel';
let mockSave={used:2,total:10};
const mockPush=jest.fn();
jest.mock('expo-router',()=>({router:{push:(path:string)=>mockPush(path)}}));
beforeEach(()=>mockPush.mockClear());
jest.mock('../../src/features/usage/use-usage',()=>({useUsage:()=>({data:{version:1,generation:{used:2,total:5},save:mockSave},error:'',refresh:jest.fn()})}));
test('archive banner uses actual remaining saves and opens the add notice',async()=>{
 mockSave={used:2,total:10};await render(<UsagePanel/>);
 expect(screen.getByTestId('archive-usage')).toHaveTextContent(/코스 저장 횟수/);
 expect(screen.getByTestId('archive-usage')).toHaveTextContent(/8 \/ 10 회 남음/);
 await fireEvent.press(screen.getByText('저장 횟수 추가'));
 expect(screen.getByText('코스 저장 횟수를 추가할까요?')).toBeVisible();
 await fireEvent.press(screen.getByTestId('allowance-add-save'));
 expect(mockPush).toHaveBeenCalledWith('/packs');
 expect(screen.queryByTestId('allowance-exhausted-count')).toBeNull();
});

test('home usage notice opens packs after closing its sheet',async()=>{
 await render(<UsagePanel compact/>);await fireEvent.press(screen.getByTestId('usage-generation'));
 await fireEvent.press(screen.getByTestId('usage-packs'));expect(mockPush).toHaveBeenCalledWith('/packs');
 expect(screen.queryByTestId('usage-free-allowance-policy')).toBeNull();
});
test('over-limit usage preserves the actual denominator and clamps only remaining display',async()=>{
 mockSave={used:12,total:10};await render(<UsagePanel/>);
 expect(screen.getByTestId('archive-usage')).toHaveTextContent(/0 \/ 10 회 남음/);
 await fireEvent.press(screen.getByText('저장 횟수 추가'));
 expect(screen.getByTestId('allowance-exhausted-count')).toHaveTextContent('12 / 10');
});
