import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import SaveCoursePanel from '../../src/features/courses/SaveCoursePanel';
import { getStorage } from '../../src/modules/storage/database';

jest.mock('../../src/modules/storage/database', () => ({ getStorage: jest.fn() }));
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
