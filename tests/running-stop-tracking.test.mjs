import assert from 'node:assert/strict';
import test from 'node:test';
import { stopTracking } from '../src/modules/running/stop-tracking.ts';

test('unregistered tasks still stop a redelivered native service', async () => {
  let stopped = 0;
  await stopTracking({ registered: async () => false,
    unregister: async () => assert.fail('No task to unregister'),
    stopService: async () => { stopped++; } });
  assert.equal(stopped, 1);
});
test('unregister finishes before native stop so a pending binding cannot win', async () => {
  const calls = [];
  await stopTracking({ registered: async () => true,
    unregister: async () => { await Promise.resolve(); calls.push('unregister'); },
    stopService: async () => { calls.push('stop'); } });
  assert.deepEqual(calls, ['unregister', 'stop']);
});
test('task lookup and unregister failures still stop the service and remain errors', async () => {
  for (const stage of ['lookup', 'unregister']) {
    let stopped = 0;
    await assert.rejects(stopTracking({
      registered: async () => { if (stage === 'lookup') throw new Error(stage); return true; },
      unregister: async () => { throw new Error(stage); },
      stopService: async () => { stopped++; },
    }), new RegExp(stage));
    assert.equal(stopped, 1);
  }
});
test('native cleanup failure never reports a successful stop', async () => {
  await assert.rejects(stopTracking({ registered: async () => false,
    unregister: async () => {}, stopService: async () => { throw new Error('stop failed'); } }), /stop failed/);
});
