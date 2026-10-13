import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import SaveCoursePanel, { CourseEditor } from '../../src/features/courses/SaveCoursePanel';
import { getStorage } from '../../src/modules/storage/database';
import { shareCourseGpx } from '../../src/modules/courses/share-gpx';
import { openServiceTab } from '../../src/features/service/open-service-tab';
let mockOwner: string | null = null;
jest.mock('../../src/modules/auth/runtime', () => ({ authentication: { getSnapshot: () => ({ account: mockOwner ? { id: mockOwner } : null }) } }));
beforeEach(() => { mockOwner = null; });

jest.mock('../../src/modules/storage/database', () => ({ getStorage: jest.fn() }));
jest.mock('../../src/modules/courses/share-gpx', () => ({ shareCourseGpx: jest.fn() }));
jest.mock('../../src/features/service/open-service-tab', () => ({ openServiceTab: jest.fn() }));
jest.mock('../../src/features/route-lab/saved-course', () => ({ courseFromCalculation: () => ({
  schemaVersion: 1, engineVersion: '0.2', source: 'synthetic', shape: 'heart', origin: { lat: 0, lng: 0 },
  targetKm: 1, lengthKm: 1, score: 90, route: [[0, 0], [0.001, 0]], target: [[0, 0], [0.001, 0]],
}) }));

test('UI-SAVE-01: entered name is submitted once while saving and opens saved course', async () => {
  let finish!: (value: any) => void;
  const save = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  jest.mocked(getStorage).mockResolvedValue({ courses: { save } } as any);
  await render(<SaveCoursePanel completed={{} as any} selected={0} />);
  await fireEvent.changeText(screen.getByTestId('course-save-name'), '내 코스');
  await fireEvent.press(screen.getByTestId('course-save'));
  expect(screen.getByTestId('course-save')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('course-save'));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][1]).toBe('내 코스');
  await act(async () => finish({ id: 'a'.repeat(32), created: true }));
  expect(screen.getByText('저장한 코스 열기')).toBeVisible();
  expect(screen.getByTestId('course-save')).toBeEnabled();
});

test('UI-SAVE-02: failed save keeps input and permits retry', async () => {
  const save = jest.fn().mockRejectedValueOnce(new Error('disk unavailable')).mockResolvedValueOnce({ id: 'b'.repeat(32), created: false });
  jest.mocked(getStorage).mockResolvedValue({ courses: { save } } as any);
  await render(<SaveCoursePanel completed={{} as any} selected={0} />);
  await fireEvent.changeText(screen.getByTestId('course-save-name'), '재시도 이름');
  await fireEvent.press(screen.getByTestId('course-save'));
  expect(screen.getByTestId('course-save-notice')).toBeVisible();
  expect(screen.getByTestId('course-save-name')).toHaveDisplayValue('재시도 이름');
  expect(screen.queryByText('저장한 코스 열기')).toBeNull();
  await fireEvent.press(screen.getByTestId('course-save'));
  expect(save).toHaveBeenCalledTimes(2);
  expect(screen.getByText('저장한 코스 열기')).toBeVisible();
});

test('UI-SAVE-03: an actual-road candidate requires explicit save before GPX or run preparation', async () => {
  const id = 'c'.repeat(32), onDraftChange = jest.fn();
  const snapshot = { schemaVersion: 1, engineVersion: '0.2', source: 'osm', shape: 'heart', origin: { lat: 37.5, lng: 127 },
    targetKm: 3, lengthKm: 2.9, score: 90, route: [[127, 37.5], [127.001, 37.5]], target: [[127, 37.5], [127.001, 37.5]] } as const;
  const save = jest.fn().mockResolvedValue({ id, created: true });
  jest.mocked(getStorage).mockResolvedValue({ courses: { save } } as any);
  jest.mocked(shareCourseGpx).mockResolvedValue('closed');
  await render(<CourseEditor snapshot={snapshot as any} selected={1} initialName="다시 여는 이름" onDraftChange={onDraftChange} />);
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByTestId('saved-course-run')).toBeDisabled();
  expect(screen.getByTestId('candidate-export')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('course-save'));
  expect(save).toHaveBeenCalledWith(snapshot, '다시 여는 이름');
  expect(onDraftChange).toHaveBeenCalledWith({ name: '다시 여는 이름', savedId: id });
  await fireEvent.press(screen.getByTestId('candidate-export'));
  expect(shareCourseGpx).toHaveBeenCalledWith(id, expect.any(AbortSignal));
  expect(screen.getByTestId('course-save-notice')).toHaveTextContent(/공유 창을 닫았어요/);
  await fireEvent.press(screen.getByTestId('saved-course-run'));
  expect(openServiceTab).toHaveBeenCalledWith({ pathname: '/run', params: { courseId: id } });
});

test('UI-SAVE-04: an account change while opening storage cannot save an old candidate to the new owner', async () => {
  let ready!: (value: any) => void;
  const save = jest.fn();
  jest.mocked(getStorage).mockImplementationOnce(() => new Promise(resolve => { ready = resolve; }));
  await render(<SaveCoursePanel completed={{} as any} selected={0} />);
  await fireEvent.press(screen.getByTestId('course-save'));
  mockOwner = 'account-b';
  await act(async () => ready({ courses: { save } }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByTestId('course-save-notice')).toHaveTextContent(/계정이 바뀌었어요/);
});
