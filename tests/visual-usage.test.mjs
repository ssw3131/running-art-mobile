import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareVisualUsage } from '../scripts/qa/visual-usage.mjs';

function backend(generation = 0, save = 0) {
  const calls = [];
  return { calls, command: async (action, args) => {
    calls.push({ action, args });
    if (action === 'status') return { generation: { used: generation, total: 5 }, save: { used: save, total: 15 } };
    if (action === 'commit') { if (args.kind === 'generation') generation++; else save++; }
    return { state: { reserve: 'reserved', ready: 'ready', commit: 'committed' }[action] };
  } };
}
const result = { result: { candidates: [{ publicFixture: true }] } };
test('fresh visual fixture follows real ledger transitions and verifies both counters', async () => {
  const b = backend(); const proof = await prepareVisualUsage(b.command, result);
  assert.deepEqual(b.calls.map(c => c.action), ['status', 'reserve', 'ready', 'commit', 'reserve', 'commit', 'status']);
  assert.equal(b.calls[1].args.id, b.calls[3].args.id);
  assert.notEqual(b.calls[1].args.id, b.calls[4].args.id);
  assert.equal(b.calls[2].args.result, result);
  assert.equal(proof.before.generation.used, 0); assert.equal(proof.after.save.used, 1);
  assert.equal(proof.reused, false);
});
test('unexpected existing usage is refused without writes', async () => {
  for (const counts of [[1, 1], [0, 1], [1, 0]]) {
    const b = backend(...counts);
    await assert.rejects(prepareVisualUsage(b.command, result));
    assert.deepEqual(b.calls.map(c => c.action), ['status']);
  }
});
test('repeat only reuses explicitly prepared state and verifies actual usage', async () => {
  const b = backend(1, 1); const proof = await prepareVisualUsage(b.command, result, true);
  assert.equal(proof.reused, true); assert.deepEqual(b.calls.map(c => c.action), ['status', 'status']);
  await assert.rejects(prepareVisualUsage(backend(1, 0).command, result, true));
});
test('ungranted reservation cannot produce successful setup', async () => {
  const b = backend();
  await assert.rejects(prepareVisualUsage((action, args) => action === 'reserve' ? { state: 'exhausted' } : b.command(action, args), result));
  assert.equal(b.calls.length, 1);
});
