import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PackSelection } from '../../src/features/packs/PackSelection';
import { PurchaseHistory } from '../../src/features/packs/PurchaseHistory';
import { PackPurchaseComplete } from '../../src/features/packs/PackPurchaseComplete';
import { packCatalog, signupBenefits } from '../../src/modules/packs/catalog';

test('selecting every pack changes only selection; purchase stays disabled and navigation is explicit', async () => {
  const back = jest.fn(), history = jest.fn();
  await render(<PackSelection onBack={back} onHistory={history} />);
  expect(signupBenefits).toEqual({ generation: 5, save: 10 });
  expect(screen.getByText(/매월 무료 횟수/)).toBeVisible();
  for (const [id, price, generation, save] of [['basic', '1,900원', 10, 20], ['plus', '2,900원', 30, 60], ['expanded', '4,900원', 60, 120]]) {
    const choice = screen.getByTestId(`pack-${id}`);
    await fireEvent.press(choice);
    expect(choice).toBeSelected();
    expect(choice).toBeChecked();
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
    expect(choice.props.accessibilityLabel).toBe(`${id === 'basic' ? '기본' : id === 'plus' ? '플러스' : '확장'} 팩, ${price}, 코스 생성 ${generation}회, 코스 저장 ${save}회`);
    expect(screen.getByTestId('pack-purchase')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('pack-purchase'));
    expect(history).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    expect(screen.queryByText(/적용됐어요/)).toBeNull();
  }
  await fireEvent.press(screen.getByTestId('pack-history')); expect(history).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByTestId('pack-back')); expect(back).toHaveBeenCalledTimes(1);
});

test.each(packCatalog)('$name completion shows the confirmed purchase snapshot without granting anything', async pack => {
  const history = jest.fn(), create = jest.fn(), saved = jest.fn();
  await render(<PackPurchaseComplete purchase={{ state: 'confirmed', orderId: 'test-order', purchasedAt: '2026-11-22T01:00:00Z', pack }} onHistory={history} onCreate={create} onSaved={saved} />);
  expect(screen.getByTestId('purchase-added-generation')).toHaveTextContent(`+${pack.generation}회`);
  expect(screen.getByTestId('purchase-added-save')).toHaveTextContent(`+${pack.save}회`);
  expect(screen.getByText(pack.priceKrw.toLocaleString('ko-KR') + '원')).toBeVisible();
  expect(history).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '구매 내역 확인' })); expect(history).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: '새 코스 만들기' })); expect(create).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: '저장한 코스 보러가기' })); expect(saved).toHaveBeenCalledTimes(1);
});

test('completion preserves the verified snapshot if catalogue benefits later differ', async () => {
  const pack = { ...packCatalog[1], priceKrw: 2500, generation: 25, save: 55 };
  await render(<PackPurchaseComplete purchase={{ state: 'confirmed', orderId: 'old-order', purchasedAt: '2026-11-01T00:00:00Z', pack }} onHistory={() => {}} onCreate={() => {}} onSaved={() => {}} />);
  expect(screen.getByTestId('purchase-added-save')).toHaveTextContent('+55회');
  expect(screen.getByText('2,500원')).toBeVisible();
});

test('history is not a fabricated empty result or sample order', async () => {
  const packs = jest.fn(), support = jest.fn();
  await render(<PurchaseHistory onPacks={packs} onSupport={support} />);
  expect(screen.getByTestId('purchase-history-preparing')).toBeVisible();
  expect(screen.queryByText(/구매 내역이 없/)).toBeNull();
  expect(screen.queryByText(/GP1234|1,900원|이용 중/)).toBeNull();
  await fireEvent.press(screen.getByTestId('history-packs')); expect(packs).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByTestId('history-support')); expect(support).toHaveBeenCalledTimes(1);
});
