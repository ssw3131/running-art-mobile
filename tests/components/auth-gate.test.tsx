import React from 'react';
import { Text } from 'react-native';
import { act, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { router, Stack } from 'expo-router';
import { ServiceStack, privateScreens } from '../../src/features/auth/ServiceStack';

jest.unmock('expo-router');
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../src/features/service/ServiceHeader', () => ({ ServiceHeader: () => null }));
let mockAuth: any = { ready: true, account: null };
let refresh: () => void;
jest.mock('../../src/features/auth/use-auth', () => ({ useAuth: () => {
  const [, update] = require('react').useState(0); refresh = () => update((n: number) => n + 1); return mockAuth;
} }));
const routes: Record<string, any> = {
  _layout: ServiceStack,
  '(tabs)/_layout': () => <Stack />,
  'account-entry': () => <Text testID="entry">회원가입</Text>,
  'auth/callback': () => <Text testID="callback">인증 처리</Text>,
  'service-policy': () => <Text testID="policy">약관</Text>,
};
for (const [name] of privateScreens) routes[name === '(tabs)' ? '(tabs)/index' : name] = () => <Text testID="private">{name}</Text>;
beforeEach(() => { mockAuth = { ready: true, account: null }; });
afterEach(() => jest.useRealTimers());

test.each([...privateScreens.map(([name]) => name === '(tabs)' ? '/' : '/' + name.replace('[id]', 'abc').replace('/index', '')), '/run'])('guest deep link %s cannot mount service content', async initialUrl => {
  // Register a tab deep link as well as the real root private route group.
  await renderRouter({ ...routes, '(tabs)/run': () => <Text testID="private">run</Text> }, { initialUrl });
  expect(screen.getByTestId('entry')).toBeVisible();
  expect(screen.queryByTestId('private')).toBeNull();
});
test('restoration waits; login alone opens home; logout clears private back history', async () => {
  mockAuth = { ready: false, account: null };
  await renderRouter(routes);
  expect(screen.getByTestId('auth-loading')).toBeVisible(); expect(screen.queryByTestId('entry')).toBeNull();
  await act(async () => { mockAuth = { ready: true, account: null }; refresh(); });
  expect(screen.getByTestId('entry')).toBeVisible();
  await act(async () => { mockAuth = { ready: true, account: { id: 'A' } }; refresh(); });
  await waitFor(() => expect(screen.getByTestId('private')).toHaveTextContent('(tabs)'));
  await act(async () => router.push('/development'));
  expect(screen.getByTestId('private')).toHaveTextContent('development');
  await act(async () => { mockAuth = { ready: true, account: null }; refresh(); });
  expect(screen.getByTestId('entry')).toBeVisible(); expect(screen.queryByTestId('private')).toBeNull();
  expect(router.canGoBack()).toBe(false);
});
test('account switch resets the previous account detail stack to home', async () => {
  mockAuth = { ready: true, account: { id: 'A' } };
  await renderRouter(routes);
  await act(async () => router.push('/development'));
  await act(async () => { mockAuth = { ready: true, account: { id: 'B' } }; refresh(); });
  await waitFor(() => expect(screen.getByTestId('private')).toHaveTextContent('(tabs)'));
  expect(router.canGoBack()).toBe(false);
});
test.each(['/service-policy?kind=terms', '/auth/callback'])('required public route %s remains accessible', async initialUrl => {
  await renderRouter(routes, { initialUrl });
  expect(screen.queryByTestId('private')).toBeNull();
  expect(screen.getByTestId(initialUrl.startsWith('/service-policy') ? 'policy' : 'callback')).toBeVisible();
});
