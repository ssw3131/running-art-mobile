import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInquiry } from '../src/modules/support/model.ts';
import { parseNotices } from '../src/modules/support/content.ts';

test('inquiries normalize input, preserve multiline details, and reject invalid or oversized content', () => {
  const input = { category: '오류 신고', title: ' 기록 확인 ', body: '첫 줄\n둘째 줄', email: '' };
  assert.deepEqual(validateInquiry(input), { ...input, title: '기록 확인' });
  assert.equal(validateInquiry({ ...input, email: ' runner@example.com ' }).email, 'runner@example.com');
  for (const change of [{ category: '알 수 없음' }, { title: ' \n ' }, { title: 'x'.repeat(101) }, { title: '숨김\u202e문자' },
    { body: '' }, { body: 'x'.repeat(5001) }, { body: 'a\u0000b' }, { email: 'runner@' }]) assert.throws(() => validateInquiry({ ...input, ...change }));
});

test('notice data rejects future, duplicate, malformed publications and orders actual publications', () => {
  const first = { id: 'a', title: '운영 안내', body: '실제 게시 내용', category: '안내', publishedAt: '2026-10-13T00:00:00Z' };
  const second = { ...first, id: 'b', publishedAt: '2026-10-14T00:00:00Z' };
  const now = Date.parse('2026-10-14T01:00:00Z');
  assert.deepEqual(parseNotices([first, second], now), [second, first]);
  assert.deepEqual(parseNotices([], now), []);
  for (const value of [null, [first, first], [{ ...first, title: '' }], [{ ...first, publishedAt: 'bad' }],
    [{ ...first, publishedAt: '2026-11-01T00:00:00Z' }], [{ ...first, id: '../x' }]]) assert.throws(() => parseNotices(value, now));
});
