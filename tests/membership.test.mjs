import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createMembershipController } from '../src/modules/membership/controller.ts';
import { createMembershipRemote } from '../src/modules/membership/remote.ts';
import { membershipAccess } from '../src/modules/membership/access.ts';
import { consentValid, parseMembership, parsePolicy, signupNickname } from '../src/modules/membership/model.ts';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const policy = { id: 'test-v1', terms: '시험 이용약관', privacy: '시험 개인정보 동의', publishedAt: '2026-10-13T00:00:00Z' };
const input = { policyId: policy.id, terms: true, privacy: true };
const complete = owner => ({ owner, policyId: policy.id, completedAt: policy.publishedAt, consentedAt: policy.publishedAt });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture({ remote: overrides = {}, storage: provided } = {}) {
  const values = new Map(), listeners = new Set(), calls = [];
  let auth = { ready: true, account: { id: A }, busy: false }, sequence = 0;
  const storage = provided ?? { getItem: async k => values.get(k) ?? null, setItem: async (k, v) => values.set(k, v), removeItem: async k => values.delete(k) };
  const remote = { policy: async () => policy, membership: async owner => ({ owner, policyId: null, completedAt: null, consentedAt: null }),
    accept: async request => { calls.push(request); return complete(request.owner); }, ...overrides };
  const controller = createMembershipController({ auth: { getSnapshot: () => auth, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } },
    remote, storage, uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` });
  return { controller, remote, calls, storage, values, change: owner => { auth = { ...auth, account: owner ? { id: owner } : null }; listeners.forEach(fn => fn()); } };
}
test('membership validates required consents, pending and completed receipts, optional nickname fallback', () => {
  assert.equal(consentValid({ ...input, privacy: false }, policy), false);
  assert.equal(consentValid({ ...input, policyId: 'old' }, policy), false);
  assert.equal(consentValid(input, policy), true);
  assert.equal(parsePolicy(null), null);
  assert.throws(() => parsePolicy({ ...policy, terms: '' }));
  assert.throws(() => parseMembership(complete(B), A));
  assert.throws(() => parseMembership({ ...complete(A), completedAt: null }, A));
  assert.equal(signupNickname('', '기존 이름'), '기존 이름');
  assert.equal(signupNickname('', ''), '러너');
  assert.equal(signupNickname('', '가'.repeat(30)).length, 20);
  assert.throws(() => signupNickname('가'.repeat(21), '기존 이름'));
});
test('existing pending and new accounts require consent; no policy does not fabricate completion', async () => {
  const f = fixture(); f.controller.start(); await tick();
  assert.equal(f.controller.getSnapshot().status, 'required');
  f.remote.policy = async () => null; await f.controller.reload();
  assert.equal(f.controller.getSnapshot().status, 'required'); assert.equal(f.controller.getSnapshot().policyStatus, 'unavailable');
  assert.equal(await f.controller.accept(input), false); assert.equal(f.calls.length, 0);
});
test('lost response retains request ID across process restart; double taps submit once', async () => {
  const gate = deferred(), f = fixture(); f.controller.start(); await tick();
  f.remote.accept = async request => { f.calls.push(request); await gate.promise; throw new Error('private server detail'); };
  const first = f.controller.accept(input); await tick();
  assert.equal(await f.controller.accept(input), false); assert.equal(f.calls.length, 1);
  gate.resolve(); assert.equal(await first, false);
  assert.doesNotMatch(f.controller.getSnapshot().message, /private/);
  f.controller.stop();
  const second = fixture({ storage: f.storage }); second.controller.start(); await tick();
  assert.equal(await second.controller.accept(input), true);
  assert.equal(second.calls[0].requestId, f.calls[0].requestId);
  assert.equal(second.controller.getSnapshot().status, 'complete');
  assert.equal([...f.values.keys()].some(key=>key.includes('.pending.')), false);
  assert.equal([...f.values.keys()].some(key=>key.includes('.receipt.')), true);
});
test('account switch discards old in-flight load and receipt, including logout/login to same owner', async () => {
  const gate = deferred(), f = fixture({ remote: { membership: owner => owner === A ? gate.promise : Promise.resolve(complete(B)) } });
  f.controller.start(); await tick(); f.change(B); await tick();
  gate.resolve(complete(A)); await tick();
  assert.equal(f.controller.getSnapshot().owner, B); assert.equal(f.controller.getSnapshot().membership.owner, B);
  const submit = deferred(); f.remote.accept = () => submit.promise;
  const pending = f.controller.accept(input); await tick(); f.change(null); f.change(B); await tick();
  submit.resolve(complete(B)); assert.equal(await pending, false);
  assert.equal(f.controller.getSnapshot().busy, false);
});
test('storage failure makes no RPC; required rejection makes no completion', async () => {
  const f = fixture(); f.controller.start(); await tick();
  assert.equal(await f.controller.accept({ ...input, terms: false }), false);
  f.storage.setItem = async () => { throw new Error('storage unavailable'); };
  assert.equal(await f.controller.accept(input), false); assert.equal(f.calls.length, 0);
  assert.equal(f.controller.getSnapshot().status, 'required');
});
test('a newer active policy cannot be acknowledged by an older successful response', async () => {
  const f = fixture(); f.controller.start(); await tick();
  f.remote.accept = async () => { f.remote.policy = async () => ({ ...policy, id: 'test-v2' }); return complete(A); };
  assert.equal(await f.controller.accept(input), false);
  assert.equal(f.controller.getSnapshot().status, 'required'); assert.equal(f.controller.getSnapshot().policy.id, 'test-v2');
});
test('server version rejection refreshes the shown document instead of retrying obsolete consent forever', async () => {
  const f = fixture(); f.controller.start(); await tick();
  f.remote.accept = async () => { f.remote.policy = async () => ({ ...policy, id: 'test-v2' }); throw { code: '22023' }; };
  assert.equal(await f.controller.accept(input), false);
  assert.equal(f.controller.getSnapshot().policy.id, 'test-v2');
  assert.equal(f.controller.getSnapshot().busy, false);
});
test('completed version restores after restart; network error is retryable and is never approval', async () => {
  const f = fixture({ remote: { membership: async () => complete(A) } }); f.controller.start(); await tick();
  assert.equal(f.controller.getSnapshot().status, 'complete');
  f.remote.policy = async () => { throw new Error('offline private detail'); }; await f.controller.reload();
  assert.equal(f.controller.getSnapshot().status, 'required'); assert.equal(f.controller.getSnapshot().policyStatus, 'error'); assert.equal(f.controller.getSnapshot().membership.owner, A);
  f.remote.policy = async () => policy; await f.controller.reload(); assert.equal(f.controller.getSnapshot().status, 'complete');
});

for (const first of ['policy', 'receipt']) test(`confirmed owner keeps service state throughout reload when ${first} returns first`, async () => {
  const f = fixture({ remote: { membership: async () => complete(A) } });
  f.controller.start(); await tick();
  assert.equal(membershipAccess(A, f.controller.getSnapshot()), 'service');
  const policyReply = deferred(), receiptReply = deferred(), states = [];
  f.remote.policy = () => policyReply.promise;
  f.remote.membership = () => receiptReply.promise;
  const unsubscribe = f.controller.subscribe(() => states.push(membershipAccess(A, f.controller.getSnapshot())));
  const loading = f.controller.reload(); await tick();
  if (first === 'policy') policyReply.resolve(policy); else receiptReply.resolve(complete(A));
  await tick();
  if (first === 'policy') receiptReply.resolve(complete(A)); else policyReply.resolve(policy);
  await loading;
  unsubscribe();
  assert.ok(states.length > 2);
  assert.deepEqual([...new Set(states)], ['service'], 'An intermediate signup state remounts the navigator and erases course conditions');
  // A real policy change must still revoke service access after resolution.
  f.remote.policy = async () => ({ ...policy, id: 'test-v2' });
  f.remote.membership = async () => complete(A);
  await f.controller.reload();
  assert.equal(membershipAccess(A, f.controller.getSnapshot()), 'signup');
  f.controller.stop();
});

test('a first receipt without a trusted cache waits for the current policy before service access', async () => {
  const reply = deferred(), f = fixture({ remote: { policy: () => reply.promise, membership: async () => complete(A) } });
  f.controller.start(); await tick();
  assert.equal(membershipAccess(A, f.controller.getSnapshot()), 'signup');
  reply.resolve({ ...policy, id: 'test-v2' }); await tick();
  assert.equal(membershipAccess(A, f.controller.getSnapshot()), 'signup');
  f.controller.stop();
});
test('SDK sends explicit owner and policy, rejects foreign receipt and tolerates only missing old RPC', async () => {
  let mode = 'normal'; const calls = [];
  const client = createClient('https://test.invalid', 'public-test-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (url, init) => {
    const body = JSON.parse(init.body); calls.push([new URL(url).pathname, body]);
    if (mode === 'old') return Response.json({ code: 'PGRST202' }, { status: 404 });
    if (mode === 'error') return Response.json({ code: '42501' }, { status: 403 });
    if (String(url).endsWith('get_membership_policy')) return Response.json(policy);
    return Response.json(complete(mode === 'foreign' ? B : A));
  } } });
  const remote = createMembershipRemote(client);
  assert.deepEqual(await remote.policy(), policy);
  await remote.accept({ ...input, owner: A, requestId: B });
  assert.deepEqual(calls[1][1], { p_owner: A, p_policy_id: policy.id, p_terms: true, p_privacy: true, p_request_id: B });
  mode = 'foreign'; await assert.rejects(remote.membership(A));
  mode = 'old'; assert.equal(await remote.policy(), null);
  mode = 'error'; await assert.rejects(remote.policy());
});


test('membership resolves independently while policy is unavailable or still loading', async () => {
  const gate = deferred(), f = fixture({ remote: { policy: () => gate.promise } });
  f.controller.start(); await tick();
  assert.equal(f.controller.getSnapshot().status, 'required');
  assert.equal(f.controller.getSnapshot().policyStatus, 'loading');
  assert.equal(f.controller.getSnapshot().membership.owner, A);
  gate.resolve(null); await tick();
  assert.equal(f.controller.getSnapshot().policyStatus, 'unavailable');
  f.remote.policy = async () => policy;
  await f.controller.retryPolicy();
  assert.equal(f.controller.getSnapshot().policyStatus, 'ready');
  assert.equal(f.controller.getSnapshot().status, 'required');
});
test('membership error is independent of a readable policy and retry cannot fabricate a receipt', async () => {
  const f = fixture({ remote: { membership: async () => { throw Error('offline'); } } }); f.controller.start(); await tick();
  assert.equal(f.controller.getSnapshot().status, 'error'); assert.equal(f.controller.getSnapshot().policyStatus, 'ready');
  await f.controller.retryPolicy(); assert.equal(f.controller.getSnapshot().status, 'error');
  f.remote.membership = async () => complete(A); await f.controller.reload();
  assert.equal(f.controller.getSnapshot().status, 'complete');
});
test('profile save holds membership busy across auth snapshots, blocks duplicates/reload and precedes consent', async () => {
  const f = fixture(), save = deferred(); f.controller.start(); await tick();
  const pending = f.controller.accept(input, () => save.promise);
  assert.equal(f.controller.getSnapshot().busy, true);
  f.change(A); await f.controller.reload();
  assert.equal(f.controller.getSnapshot().busy, true);
  assert.equal(await f.controller.accept(input), false); assert.equal(f.calls.length, 0);
  save.resolve(true); assert.equal(await pending, true); assert.equal(f.calls.length, 1);
});
test('failed profile save never accepts consent; account switching during save ignores its late result', async () => {
  const f = fixture(); f.controller.start(); await tick();
  assert.equal(await f.controller.accept(input, async () => false), false); assert.equal(f.calls.length, 0);
  const save = deferred(), pending = f.controller.accept(input, () => save.promise);
  f.change(null); f.change(B); await tick(); save.resolve(true);
  assert.equal(await pending, false); assert.equal(f.calls.length, 0);
  assert.equal(f.controller.getSnapshot().owner, B); assert.equal(f.controller.getSnapshot().status, 'required');
});
test('deletion and rejoining with a new auth ID cannot reuse the old receipt or pending request', async () => {
  const f = fixture(); f.controller.start(); await tick(); await f.controller.accept(input);
  assert.equal(f.controller.getSnapshot().status, 'complete');
  f.change(null); f.change(B); await tick();
  assert.equal(f.controller.getSnapshot().status, 'required'); assert.equal(f.controller.getSnapshot().membership.owner, B);
  await f.controller.accept(input); assert.equal(f.calls[1].owner, B); assert.notEqual(f.calls[0].requestId, f.calls[1].requestId);
});

test('consent receipt with failed latest-policy lookup stays behind the gate until policy retry confirms it', async () => {
  const f = fixture(); f.controller.start(); await tick();
  f.remote.accept = async () => { f.remote.policy = async () => { throw Error('offline'); }; return complete(A); };
  assert.equal(await f.controller.accept(input, async () => true), false);
  assert.equal(f.controller.getSnapshot().status, 'required');
  assert.equal(f.controller.getSnapshot().policyStatus, 'error');
  assert.equal(f.controller.getSnapshot().membership.owner, A);
  f.remote.policy = async () => policy; await f.controller.retryPolicy();
  assert.equal(f.controller.getSnapshot().status, 'complete');
});
