import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import Ajv from 'ajv/dist/2020.js';
import { spec } from '../scripts/qa/openapi.mjs';
import { request, response } from './helpers/compute-contract.mjs';
import { createComputeServer } from '../server/route-compute/server.mjs';
import { parseComputeResponse } from '../src/modules/route-compute/contract.ts';
const ajv = new Ajv({ strict: false, allErrors: true });
const validate = name => ajv.compile({ ...spec.components.schemas[name], components: spec.components });

test('API-CONTRACT-01: real HTTP health, success and error conform to published OpenAPI', async t => {
  const server = createComputeServer({ run: async input => response(input), close: async () => {} });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, init, status, schema] of [
    ['/health', {}, 200, 'Health'],
    ['/v1/routes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) }, 200, 'Response'],
    ['/v1/routes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, 400, 'Error'],
  ]) {
    const actual = await fetch(base + path, init), body = await actual.json(), check = validate(schema);
    assert.equal(actual.status, status); assert.ok(check(body), JSON.stringify(check.errors));
    if (schema === 'Response') assert.deepEqual(parseComputeResponse(body, request), body);
  }
});

test('API-CONTRACT-02 mutation probe: missing nested fields are detected independently', () => {
  const check = validate('Response');
  for (const field of ['contract', 'request', 'roads', 'timing', 'metrics', 'result']) {
    const broken = structuredClone(response()); delete broken[field];
    assert.equal(check(broken), false, field);
    assert.throws(() => parseComputeResponse(broken, request));
  }
  const broken = structuredClone(response()); delete broken.result.candidates[0].score.lengthKm;
  assert.equal(check(broken), false); assert.throws(() => parseComputeResponse(broken, request));
});
