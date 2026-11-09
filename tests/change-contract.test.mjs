import assert from 'node:assert/strict';
import test from 'node:test';
import { validateChangeReviews } from '../scripts/qa/change-contract.mjs';

const path = 'docs/quality/change-reviews/example.json';
const changed = ['src/new/Screen.tsx', 'tests/components/screen.test.tsx', path];
const review = () => ({ path, data: { schemaVersion: 1, paths: changed.slice(0, 2), behavior: 'changed',
  decision: '사용자가 홈 진입은 조건 화면으로 확정했다.', before: '이전에는 추천 결과 화면을 열었다.', after: '현재는 조건을 열고 이전 결과는 보존한다.',
  invariants: ['새 생성 확인 전에는 이용 횟수를 차감하지 않는다.'],
  tests: [{ path: changed[1], reason: '조건 진입과 결과 보존을 같이 검증한다.' }],
  visual: { status: 'unchanged', reason: '레이아웃과 표시 문구는 변경하지 않는다.' }, native: 'home 진단으로 실제 진입과 취소를 확인한다.' } });

test('new product areas require a same-change review; stale records cannot cover them', () => {
  assert.equal(validateChangeReviews(changed, [review()], () => true).errors.length, 0);
  assert.ok(validateChangeReviews(changed, [], () => true).errors.length);
  assert.ok(validateChangeReviews(changed.slice(0, 2), [review()], () => true).errors.length);
  assert.equal(validateChangeReviews(['docs/handoff/status.md'], []).errors.length, 0);
});
test('review rejects missing decisions, dead tests, incomplete coverage and unreviewed visual changes', () => {
  for (const mutate of [r => r.decision = 'TODO', r => r.invariants = [], r => r.paths.pop(),
    r => r.tests = [], r => r.visual = { status: 'changed', reason: '의도된 새 화면으로 변경했다.' },
    r => r.tests[0].path = 'tests/../private.json']) {
    const record = review(); mutate(record.data);
    assert.ok(validateChangeReviews(changed, [record], () => true).errors.length);
  }
  assert.ok(validateChangeReviews(changed, [review()], () => false).errors.length);
});
test('harness and workflow changes also require explicit unchanged-product reasoning', () => {
  const files = ['scripts/qa/android.py', '.github/workflows/verify.yml', path];
  const record = review(); record.data.paths = files.slice(0, 2); record.data.behavior = 'preserved';
  assert.equal(validateChangeReviews(files, [record], () => true).errors.length, 0);
});
