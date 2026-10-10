import { createGcsAdmissionStore } from '../../server/route-compute/admission-store.mjs';

const [action, bucket] = process.argv.slice(2);
if (!['status', 'pause', 'resume'].includes(action) || !process.env.ROUTE_OPERATOR_TOKEN) {
  throw Error('Usage: status|pause|resume BUCKET with ROUTE_OPERATOR_TOKEN');
}
const store = createGcsAdmissionStore({ bucket, token: async () => process.env.ROUTE_OPERATOR_TOKEN });
const signal = AbortSignal.timeout(15000);
let result;
for (let attempt = 0; attempt < 3; attempt++) {
  let snapshot;
  try { snapshot = await store.read(signal); }
  catch (error) { if (error.code === 'guard_read_changed') continue; throw error; }
  if (snapshot.state.version !== 1 || typeof snapshot.state.paused !== 'boolean') throw Error('invalid_state');
  if (action === 'status' || snapshot.state.paused === (action === 'pause')) { result = snapshot.state; break; }
  const state = { ...snapshot.state, paused: action === 'pause' };
  if (await store.compareAndSwap(snapshot.generation, state, signal)) { result = state; break; }
}
if (!result) throw Error('State changed concurrently; no unconditional overwrite was attempted');
console.log(JSON.stringify({ action, at: new Date().toISOString(), state: result }));
