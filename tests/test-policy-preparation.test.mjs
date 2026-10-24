import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareTestPolicySql } from '../scripts/policies/prepare-test-policies.mjs';
import { policyPublicationLabel } from '../src/modules/membership/policy-presentation.ts';
const input = { terms: "원문 '이용약관'\n시행일: 미정", privacy: '개인정보 원문', location: '위치약관 원문', publishedAt: '2026-10-24T20:00:00+09:00' };
test('test policy preparation preserves source text and uses only existing policy tables', () => {
  const sql = prepareTestPolicySql(input);
  assert.ok(sql.includes(input.terms.replaceAll("'", "''")));
  assert.ok(sql.includes(input.privacy)); assert.ok(sql.includes(input.location));
  assert.match(sql, /정식 출시 시행일은 미정/);
  assert.match(sql, /BEGIN;/); assert.match(sql, /COMMIT;/);
  assert.match(sql, /Version already exists/);
  assert.match(sql, /effective_at,published/);
  assert.doesNotMatch(sql, /INSERT INTO public\.(memberships|membership_consents)|UPDATE public\.service_policies|CREATE (TABLE|FUNCTION)|ON CONFLICT/i);
});
test('publication requires an explicit timezone timestamp and a test-only immutable version', () => {
  for (const publishedAt of [undefined, '', '2026-10-24', 'not a date']) assert.throws(() => prepareTestPolicySql({ ...input, publishedAt }));
  assert.throws(() => prepareTestPolicySql({ ...input, version: 'release-v1' }));
  assert.throws(() => prepareTestPolicySql({ ...input, terms: '' }));
  assert.match(policyPublicationLabel('runpen-test-20261024-v1', input.publishedAt), /시험 게시.*정식 출시 시행일 미정/);
});
