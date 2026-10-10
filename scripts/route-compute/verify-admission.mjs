import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createAdmissionGuard, emptyAdmissionState } from '../../server/route-compute/admission.mjs';
import { createGcsAdmissionStore } from '../../server/route-compute/admission-store.mjs';

const [bucket, output] = process.argv.slice(2);
const credential = process.env.ROUTE_QA_TOKEN;
if (!bucket || !output || !credential) throw Error('Usage: BUCKET OUTPUT and ROUTE_QA_TOKEN (not written to evidence)');
const object = `qa-${randomUUID()}.json`;
const objectUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${object}`;
const auth = { authorization: `Bearer ${credential}` };
const call = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
const record = { createdAt: new Date().toISOString(), bucket, object, checks: {} };
let created = false;
try {
  const seed = await call(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${object}&ifGenerationMatch=0`,
    { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(emptyAdmissionState()) });
  assert.equal(seed.status, 200); created = true; await seed.body.cancel();
  // GCS recommends no more than one update/second to a single object.
  await new Promise(resolve => setTimeout(resolve, 1100));
  const store = createGcsAdmissionStore({ bucket, object, token: async () => credential });
  const make = () => createAdmissionGuard({ store, limits: { minute: 1, hour: 10, day: 10, month: 10 } });
  const outcomes = await Promise.allSettled([make().reserve(new AbortController().signal), make().reserve(new AbortController().signal)]);
  record.checks.concurrent = outcomes.map(value => value.status === 'fulfilled' ? 'admitted' : value.reason.code);
  assert.equal(record.checks.concurrent.filter(value => value === 'admitted').length, 1);
  const snapshot = await store.read(new AbortController().signal);
  assert.equal(snapshot.state.windows.month.count, 1);
  record.checks.persistedCount = snapshot.state.windows.month.count;
  await assert.rejects(make().reserve(new AbortController().signal), error => error.code === 'limit_minute');
  record.checks.freshGuardDenied = true;
  const stale = await store.compareAndSwap('1', emptyAdmissionState(), new AbortController().signal);
  assert.equal(stale, false); record.checks.staleWriteRejected = true;
  const anonymous = await call(`${objectUrl}?alt=media`);
  assert.ok([401, 403].includes(anonymous.status)); record.checks.anonymousStatus = anonymous.status;
  await anonymous.body.cancel();
} finally {
  if (created) {
    const meta = await call(`${objectUrl}?fields=generation`, { headers: auth });
    assert.equal(meta.status, 200); const { generation } = await meta.json();
    const deleted = await call(`${objectUrl}?ifGenerationMatch=${generation}`, { method: 'DELETE', headers: auth });
    assert.equal(deleted.status, 204); record.checks.testObjectDeleted = true;
  }
  fs.writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
}
console.log(JSON.stringify(record));
