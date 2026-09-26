import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';

import { locateForeground } from '../src/modules/location/locate.ts';

const allowed = { granted: true, canAskAgain: true };
const denied = { granted: false, canAskAgain: true };
const position = () => ({ latitude: 37.57, longitude: 126.98, accuracy: 25, timestamp: Date.now() });

function fixture(overrides = {}) {
  const calls = { permissions: 0, services: 0, watches: 0, removed: 0 };
  let update;
  let error;
  const provider = {
    getPermission: async () => allowed,
    requestPermission: async () => { calls.permissions++; return allowed; },
    servicesEnabled: async () => { calls.services++; return true; },
    watch: async (onPosition, onError) => {
      calls.watches++;
      update = onPosition;
      error = onError;
      return { remove: () => { calls.removed++; } };
    },
    ...overrides,
  };
  return { provider, calls, update: (value) => update(value), fail: () => error() };
}

test('permission denial never starts GPS', async () => {
  const f = fixture({ getPermission: async () => denied, requestPermission: async () => denied });
  assert.deepEqual(await locateForeground(f.provider, new AbortController().signal), { kind: 'denied', canAskAgain: true });
  assert.equal(f.calls.watches, 0);
  assert.equal(f.calls.services, 0);
});

test('permanent denial does not attempt another permission prompt', async () => {
  const f = fixture({ getPermission: async () => ({ ...denied, canAskAgain: false }) });
  assert.deepEqual(await locateForeground(f.provider, new AbortController().signal), { kind: 'denied', canAskAgain: false });
  assert.equal(f.calls.permissions, 0);
  assert.equal(f.calls.watches, 0);
});

test('a second denial refreshes the OS permission state before offering settings', async () => {
  let reads = 0;
  const f = fixture({
    getPermission: async () => ({ ...denied, canAskAgain: ++reads === 1 }),
    requestPermission: async () => denied,
  });
  assert.deepEqual(await locateForeground(f.provider, new AbortController().signal), { kind: 'denied', canAskAgain: false });
  assert.equal(f.calls.watches, 0);
});

test('returning from settings checks permission without automatically asking again', async () => {
  const f = fixture({ getPermission: async () => denied });
  const result = await locateForeground(f.provider, new AbortController().signal, { askPermission: false });
  assert.equal(result.kind, 'denied');
  assert.equal(f.calls.permissions, 0);
});

test('disabled location services do not start a GPS watch', async () => {
  const f = fixture({ servicesEnabled: async () => false });
  assert.deepEqual(await locateForeground(f.provider, new AbortController().signal), { kind: 'services-disabled' });
  assert.equal(f.calls.watches, 0);
});

test('permission approval delivers one fix and removes the GPS watch', async () => {
  const f = fixture({ getPermission: async () => denied });
  const pending = locateForeground(f.provider, new AbortController().signal);
  await setImmediate();
  const fix = position();
  f.update(fix);
  assert.deepEqual(await pending, { kind: 'located', position: fix });
  assert.equal(f.calls.permissions, 1);
  assert.equal(f.calls.removed, 1);
  f.update(position());
  assert.equal(f.calls.removed, 1);
});

test('approximate location is accepted with its reported accuracy', async () => {
  const f = fixture();
  const pending = locateForeground(f.provider, new AbortController().signal);
  await setImmediate();
  f.update({ ...position(), accuracy: 2000 });
  assert.equal((await pending).position.accuracy, 2000);
});

test('old and invalid coordinates do not appear as the current location', async () => {
  const f = fixture();
  const pending = locateForeground(f.provider, new AbortController().signal);
  await setImmediate();
  f.update({ ...position(), timestamp: Date.now() - 120000 });
  f.update({ ...position(), longitude: NaN });
  assert.equal(f.calls.removed, 0);
  const fix = position();
  f.update(fix);
  assert.deepEqual(await pending, { kind: 'located', position: fix });
});

test('GPS timeout removes the native subscription', async () => {
  const f = fixture();
  assert.deepEqual(await locateForeground(f.provider, new AbortController().signal, { timeoutMs: 10 }), { kind: 'timeout' });
  assert.equal(f.calls.removed, 1);
});

test('leaving the screen cancels the request and ignores later fixes', async () => {
  const f = fixture();
  const controller = new AbortController();
  const pending = locateForeground(f.provider, controller.signal);
  await setImmediate();
  controller.abort();
  f.update(position());
  assert.deepEqual(await pending, { kind: 'cancelled' });
  assert.equal(f.calls.removed, 1);
});

test('cancellation while permission prompt is pending does not start GPS', async () => {
  let answer;
  const f = fixture({ getPermission: async () => denied, requestPermission: () => new Promise((resolve) => { answer = resolve; }) });
  const controller = new AbortController();
  const pending = locateForeground(f.provider, controller.signal);
  await setImmediate();
  controller.abort();
  answer(allowed);
  assert.deepEqual(await pending, { kind: 'cancelled' });
  assert.equal(f.calls.watches, 0);
});

test('a subscription arriving after cancellation is immediately removed', async () => {
  let subscribe;
  let removed = 0;
  const f = fixture({ watch: () => new Promise((resolve) => { subscribe = resolve; }) });
  const controller = new AbortController();
  const pending = locateForeground(f.provider, controller.signal);
  await setImmediate();
  controller.abort();
  assert.equal((await pending).kind, 'cancelled');
  subscribe({ remove: () => { removed++; } });
  await setImmediate();
  assert.equal(removed, 1);
});

test('an immediate callback still removes a subscription that resolves later', async () => {
  let removed = 0;
  const f = fixture({ watch: async (onPosition) => {
    onPosition(position());
    return { remove: () => { removed++; } };
  } });
  assert.equal((await locateForeground(f.provider, new AbortController().signal)).kind, 'located');
  await setImmediate();
  assert.equal(removed, 1);
});

test('provider failure releases GPS and permits a later retry', async () => {
  const f = fixture();
  const failed = locateForeground(f.provider, new AbortController().signal);
  await setImmediate();
  f.fail();
  assert.equal((await failed).kind, 'unavailable');
  assert.equal(f.calls.removed, 1);
  const retry = locateForeground(f.provider, new AbortController().signal);
  await setImmediate();
  f.update(position());
  assert.equal((await retry).kind, 'located');
  assert.equal(f.calls.removed, 2);
});

test('native watch rejection returns an error instead of hanging', async () => {
  const f = fixture({ watch: async () => { throw new Error('provider unavailable'); } });
  assert.equal((await locateForeground(f.provider, new AbortController().signal)).kind, 'unavailable');
});
