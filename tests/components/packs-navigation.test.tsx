import React from 'react';
import { BackHandler, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PackFrame, backFromPacks } from '../../src/features/packs/PackFrame';
import Packs from '../../src/app/packs';
import History from '../../src/app/purchase-history';

const mockBack = jest.fn(), mockReplace = jest.fn(), mockTab = jest.fn(), mockPush = jest.fn(), mockNavigate = jest.fn();
let mockHasBack = false;
let mockAccount: { id: string } | null = { id: 'owner' };
jest.mock('../../src/features/auth/use-auth', () => ({ useAuth: () => ({ account: mockAccount }) }));
jest.mock('expo-router', () => ({
  router: { canGoBack: () => mockHasBack, back: () => mockBack(), replace: (route: string) => mockReplace(route), push: (route: unknown) => mockPush(route), navigate: (route: string) => mockNavigate(route) },
  Stack: { Screen: ({ options }: any) => options.header() },
  useFocusEffect: (fn: any) => require('react').useEffect(fn, [fn]),
}));
jest.mock('../../src/features/service/open-service-tab', () => ({ openServiceTab: (route: string) => mockTab(route) }));
beforeEach(() => { jest.clearAllMocks(); mockHasBack = false; mockAccount = { id: 'owner' }; });

test('member routes connect selection, history and support without a purchase-complete route', async () => {
  const selection = await render(<Packs />);
  expect(screen.getByTestId('pack-purchase')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('pack-history')); expect(mockPush).toHaveBeenLastCalledWith('/purchase-history');
  await selection.unmount(); await render(<History />);
  expect(screen.getByTestId('purchase-history-preparing')).toBeVisible();
  await fireEvent.press(screen.getByTestId('history-packs')); expect(mockNavigate).toHaveBeenCalledWith('/packs');
  await fireEvent.press(screen.getByTestId('history-support')); expect(mockPush).toHaveBeenLastCalledWith('/service-inquiry');
});

test.each([Packs, History])('guest pack routes show signup without mounting member content', async Route => {
  mockAccount = null; await render(<Route />);
  expect(screen.getByTestId('guest-member-notice')).toBeVisible();
  expect(screen.queryByTestId('pack-purchase')).toBeNull(); expect(screen.queryByTestId('purchase-history-preparing')).toBeNull();
  await fireEvent.press(screen.getByText('회원가입하기'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/account-entry', params: { mode: 'signup' } });
});

test('header and explicit back return to the caller, with a cold-link account fallback', async () => {
  await render(<PackFrame title="RunPen 팩 구매"><Text>팩 화면</Text></PackFrame>);
  expect(mockBack).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('service-back')); expect(mockReplace).toHaveBeenCalledWith('/account');
  mockHasBack = true;
  await fireEvent.press(screen.getByTestId('service-back')); expect(mockBack).toHaveBeenCalledTimes(1);
  backFromPacks(); expect(mockBack).toHaveBeenCalledTimes(2);
});

test('hardware back lets existing history handle the event and removes its listener on unmount', async () => {
  const remove = jest.fn(); let press: (() => boolean | null | undefined) | undefined;
  const listener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, callback) => { press = callback; return { remove }; });
  try {
    const view = await render(<PackFrame title="구매 내역" />);
    mockHasBack = true; expect(press?.()).toBe(false); expect(mockReplace).not.toHaveBeenCalled();
    mockHasBack = false; expect(press?.()).toBe(true); expect(mockReplace).toHaveBeenCalledWith('/account');
    await view.unmount(); expect(remove).toHaveBeenCalledTimes(1);
  } finally { listener.mockRestore(); }
});

test('bottom menus use the existing service-tab transition', async () => {
  await render(<PackFrame title="RunPen 팩 구매" />);
  expect(mockTab).not.toHaveBeenCalled();
  for (const [tab, route] of [['home', '/'], ['courses', '/route-lab'], ['run', '/run'], ['archive', '/courses'], ['account', '/account']]) {
    await fireEvent.press(screen.getByTestId(`tab-${tab}`)); expect(mockTab).toHaveBeenLastCalledWith(route);
  }
});
