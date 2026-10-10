import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { COMPUTE_CONTRACT, parseComputeResponse } from '../../src/modules/route-compute/contract.ts';

const [base, output] = process.argv.slice(2);
if (!base?.startsWith('https://') || !output) throw Error('Usage: HTTPS_BASE OUTPUT');
const request = { contract: COMPUTE_CONTRACT, origin: { lat: 37.4979, lng: 127.0276 },
  options: { version: '0.2', mode: 'free-loop', shape: 'heart', targetKm: 5, radiusKm: 2 }, refresh: false };
// Eight requests once; never an unbounded stress test or retry loop.
const responses = await Promise.all(Array.from({ length: 8 }, async () => {
  const started = performance.now();
  const response = await fetch(`${base}/v1/routes`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request), redirect: 'error', signal: AbortSignal.timeout(80000) });
  const text = await response.text(), ms = performance.now() - started;
  let data; try { data = JSON.parse(text); } catch { data = {}; }
  if (response.status === 200) {
    const result = parseComputeResponse(data, request).result;
    return { status: 200, ms, resultSha256: createHash('sha256').update(JSON.stringify(result)).digest('hex') };
  }
  return { status: response.status, ms, error: data.error ?? 'platform_response', retryAfter: response.headers.get('retry-after') };
}));
const successful = responses.filter(item => item.status === 200);
assert.ok(responses.every(item => [200, 429, 503].includes(item.status)));
assert.ok(responses.some(item => item.status !== 200), 'Expected bounded rejection of overload');
if (successful.length) assert.ok(successful.every(item => item.resultSha256 === successful[0].resultSha256));
const report = { at: new Date().toISOString(), base, responses };
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
