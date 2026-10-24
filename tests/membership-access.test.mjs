import assert from 'node:assert/strict';
import test from 'node:test';
import { membershipAccess } from '../src/modules/membership/access.ts';
const ready = { owner: 'A', status: 'complete', busy: false, policyStatus: 'ready', policy: { id: 'v1' }, membership: { owner: 'A', policyId: 'v1', completedAt: '2026-10-24' } };
test('only a current-owner completed receipt for the available policy opens the service', () => {
  assert.equal(membershipAccess(null, ready), 'guest');
  assert.equal(membershipAccess('A', ready), 'service');
  for (const change of [{ owner: 'B' }, { status: 'required' }, { status: 'loading' }, { status: 'error' }, { busy: true }, { policyStatus: 'error' }, { policy: null }, { membership: null }, { membership: { ...ready.membership, owner: 'B' } }, { membership: { ...ready.membership, policyId: 'v0' } }]) {
    assert.equal(membershipAccess('A', { ...ready, ...change }), 'signup');
  }
});
