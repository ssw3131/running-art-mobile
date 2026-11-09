// Explicit server fixture for visual-only QA; never called by full acceptance.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

export async function prepareVisualUsage(command, result, prepared = false) {
  const startedAt = new Date().toISOString();
  const before = await command('status');
  const check = (status, used) => {
    assert.equal(status.generation.used, used, 'Unexpected visual generation usage');
    assert.equal(status.save.used, used, 'Unexpected visual save usage');
    assert.equal(status.generation.total, 5, 'Unexpected visual generation limit');
    assert.equal(status.save.total, 15, 'Unexpected visual save limit');
  };
  check(before, prepared ? 1 : 0);
  if (!prepared) {
    assert.ok(result?.result?.candidates?.length, 'Public computed fixture required');
    const fingerprint = createHash('sha256').update(JSON.stringify(result)).digest('hex');
    const generation = { id: randomUUID(), kind: 'generation', fingerprint };
    assert.equal((await command('reserve', generation)).state, 'reserved');
    assert.equal((await command('ready', { ...generation, result })).state, 'ready');
    assert.equal((await command('commit', generation)).state, 'committed');
    const save = { id: randomUUID(), kind: 'save', fingerprint, courseId: 'd'.repeat(32) };
    assert.equal((await command('reserve', save)).state, 'reserved');
    assert.equal((await command('commit', save)).state, 'committed');
  }
  const after = await command('status');
  check(after, 1);
  return { id: 'visual-server-usage', status: 'passed', startedAt, finishedAt: new Date().toISOString(),
    reused: prepared, before, after, evidence: 'Isolated real usage RPC fixture; not generation/save UI acceptance' };
}
