import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Board from '../../src/app/service-inquiry';
import Detail from '../../src/app/service-inquiry-detail';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id = '11111111-1111-4111-8111-111111111111';
let mockOwner = owner;
const mockValues = new Map<string, string>();
const mockPush = jest.fn(), mockReplace = jest.fn(), mockDismiss = jest.fn();
const mockRemote = { list: jest.fn(), detail: jest.fn(), submit: jest.fn(), update: jest.fn(), remove: jest.fn() };
jest.mock('../../src/modules/support/runtime', () => ({ supportRemote: {
  list: (...args: unknown[]) => mockRemote.list(...args), detail: (...args: unknown[]) => mockRemote.detail(...args),
  submit: (...args: unknown[]) => mockRemote.submit(...args), update: (...args: unknown[]) => mockRemote.update(...args), remove: (...args: unknown[]) => mockRemote.remove(...args),
} }));
jest.mock('../../src/features/auth/use-auth', () => ({ useAuth: () => ({ ready: true, account: { id: mockOwner } }) }));
jest.mock('../../src/modules/auth/runtime', () => ({
  authentication: { getSnapshot: () => ({ account: { id: mockOwner } }) },
  accountSecureStorage: { getItem: async (key: string) => mockValues.get(key) ?? null, setItem: async (key: string, value: string) => { mockValues.set(key, value); }, removeItem: async (key: string) => { mockValues.delete(key); } },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args), dismissTo: (...args: unknown[]) => mockDismiss(...args) },
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (effect: () => () => void) => require('react').useEffect(effect, [effect]),
}));
const inquiry = { id, category: '기타', title: '내 문의', body: '원래 내용', receivedAt: '2026-11-20T00:00:00Z', version: 1, reply: null, repliedAt: null, replyUpdatedAt: null };
const item = { id, category: inquiry.category, title: inquiry.title, receivedAt: inquiry.receivedAt, answered: false };
beforeEach(() => {
  jest.clearAllMocks(); mockOwner = owner; mockValues.clear();
  for (const fn of Object.values(mockRemote)) fn.mockReset();
  mockRemote.list.mockResolvedValue({ items: [], next: null });
  mockRemote.detail.mockResolvedValue(inquiry);
  mockRemote.submit.mockResolvedValue({ id, receivedAt: inquiry.receivedAt });
  mockRemote.update.mockResolvedValue(undefined); mockRemote.remove.mockResolvedValue(undefined);
});

test('loading and failed lists never masquerade as an empty list; retry opens the email-free form', async () => {
  let reject!: (error: Error) => void;
  mockRemote.list.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  await render(<Board />);
  expect(screen.queryByTestId('inquiry-title')).toBeNull();
  await act(async () => reject(new Error('offline')));
  expect(screen.queryByTestId('inquiry-title')).toBeNull();
  await fireEvent.press(screen.getByTestId('inquiry-list-retry'));
  await waitFor(() => expect(screen.getByTestId('inquiry-title')).toBeVisible());
  expect(screen.queryByTestId('inquiry-email')).toBeNull();
  await fireEvent.changeText(screen.getByTestId('inquiry-title'), '새 문의');
  await fireEvent.changeText(screen.getByTestId('inquiry-body'), '내용');
  await fireEvent.press(screen.getByTestId('inquiry-submit'));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/service-inquiry-detail', params: { id } }));
  expect(mockRemote.submit).toHaveBeenCalledWith(owner, id, { category: '사용 방법', title: '새 문의', body: '내용' });
});

test('a populated list shows status, pagination, detail navigation and a separate write action', async () => {
  const next = { receivedAt: item.receivedAt, id };
  mockRemote.list.mockResolvedValueOnce({ items: [item], next }).mockResolvedValueOnce({ items: [{ ...item, id: 'second', title: '답변 있는 문의', answered: true }], next: null });
  await render(<Board />);
  await waitFor(() => expect(screen.getByTestId(`inquiry-${id}`)).toBeVisible());
  expect(screen.getByText('미확인')).toBeVisible();
  await fireEvent.press(screen.getByTestId(`inquiry-${id}`));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/service-inquiry-detail', params: { id } });
  await fireEvent.press(screen.getByTestId('inquiry-more'));
  await waitFor(() => expect(screen.getByText('답변 완료')).toBeVisible());
  expect(mockRemote.list).toHaveBeenLastCalledWith(next);
  await fireEvent.press(screen.getByTestId('inquiry-write'));
  expect(mockPush).toHaveBeenLastCalledWith('/service-inquiry-write');
});

test('published replies display under the operating team heading and hide user mutation controls', async () => {
  mockRemote.detail.mockResolvedValue({ ...inquiry, reply: '확인했습니다.', repliedAt: inquiry.receivedAt, replyUpdatedAt: inquiry.receivedAt, version: 2 });
  await render(<Detail />);
  await waitFor(() => expect(screen.getByText('RunPen 운영팀 답변')).toBeVisible());
  expect(screen.getByTestId('inquiry-reply')).toHaveTextContent('확인했습니다.');
  expect(screen.queryByTestId('inquiry-edit')).toBeNull(); expect(screen.queryByTestId('inquiry-delete')).toBeNull();
});

test('an answer arriving during edit discards stale editing and reloads the published answer', async () => {
  await render(<Detail />);
  await waitFor(() => expect(screen.getByTestId('inquiry-edit')).toBeVisible());
  await fireEvent.press(screen.getByTestId('inquiry-edit'));
  await fireEvent.changeText(screen.getByTestId('inquiry-body'), '바꾸려던 내용');
  mockRemote.update.mockRejectedValue({ code: '40001', message: 'Inquiry answered' });
  mockRemote.detail.mockResolvedValue({ ...inquiry, reply: '새 답변', repliedAt: inquiry.receivedAt, replyUpdatedAt: inquiry.receivedAt, version: 2 });
  await fireEvent.press(screen.getByTestId('inquiry-save'));
  await waitFor(() => expect(screen.getByTestId('inquiry-reply')).toHaveTextContent('새 답변'));
  expect(screen.getByTestId('inquiry-detail-body')).toHaveTextContent('원래 내용');
  expect(screen.queryByTestId('inquiry-save')).toBeNull();
});

test('delete requires confirmation and returns to the list only after the server acknowledges it', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<Detail />);
  await waitFor(() => expect(screen.getByTestId('inquiry-delete')).toBeVisible());
  await fireEvent.press(screen.getByTestId('inquiry-delete'));
  expect(mockRemote.remove).not.toHaveBeenCalled();
  await act(async () => { alert.mock.calls[0][2]![1].onPress!(); });
  await waitFor(() => expect(mockDismiss).toHaveBeenCalledWith('/service-inquiry'));
  expect(mockRemote.remove).toHaveBeenCalledWith(id, 1);
  alert.mockRestore();
});

test('switching accounts clears private content and ignores the previous account response', async () => {
  let finish!: (value: unknown) => void;
  mockRemote.list.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const view = await render(<Board />);
  mockOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await view.rerender(<Board />);
  await waitFor(() => expect(screen.getByTestId('inquiry-title')).toBeVisible());
  await act(async () => finish({ items: [item], next: null }));
  expect(screen.queryByText('내 문의')).toBeNull();
});
