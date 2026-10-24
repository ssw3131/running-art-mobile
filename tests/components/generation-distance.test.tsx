// Distance modal validation and accessible slider interactions.
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GenerationDistanceInput } from '../../src/features/course-generation/GenerationDistanceInput';
jest.mock('expo-router', () => ({ useFocusEffect: (effect: any) => require('react').useEffect(effect, [effect]) }));
function Distance() { const [value,setValue]=useState(5); return <GenerationDistanceInput value={value} onChange={setValue} />; }

test('extended distance rejects invalid text, applies 20 and cancel preserves selection', async () => {
  await render(<Distance />);
  await fireEvent.press(screen.getByTestId('distance-more'));
  for (const text of ['', '21', '10', '11.5', 'abc']) {
    await fireEvent.changeText(screen.getByTestId('distance-input'),text);
    await fireEvent.press(screen.getByTestId('distance-apply'));
    expect(screen.getByText('11~20km 사이의 정수를 입력해 주세요.')).toBeVisible();
    expect(screen.getByTestId('distance-value')).toHaveTextContent('5 km');
  }
  await fireEvent.changeText(screen.getByTestId('distance-input'),'20');
  await fireEvent.press(screen.getByTestId('distance-apply'));
  expect(screen.getByTestId('distance-value')).toHaveTextContent('20 km');
  await fireEvent.press(screen.getByTestId('distance-more'));
  await fireEvent.changeText(screen.getByTestId('distance-input'),'15');
  await fireEvent.press(screen.getByTestId('distance-cancel'));
  expect(screen.getByTestId('distance-value')).toHaveTextContent('20 km');
  await fireEvent.press(screen.getByTestId('distance-3'));
  expect(screen.getByTestId('distance-value')).toHaveTextContent('3 km');
});
test('slider supports accessible increments without exceeding its range', async () => {
  await render(<Distance />);
  await fireEvent(screen.getByTestId('distance-slider'),'accessibilityAction',{nativeEvent:{actionName:'increment'}});
  expect(screen.getByTestId('distance-value')).toHaveTextContent('6 km');
  await fireEvent.press(screen.getByTestId('distance-10'));
  await fireEvent(screen.getByTestId('distance-slider'),'accessibilityAction',{nativeEvent:{actionName:'increment'}});
  expect(screen.getByTestId('distance-value')).toHaveTextContent('10 km');
});
