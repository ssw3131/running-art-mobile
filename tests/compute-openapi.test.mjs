import { usageFixture, usageHeaders } from './helpers/usage.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import Ajv from 'ajv/dist/2020.js';
import { spec } from '../scripts/qa/openapi.mjs';
import { request, response } from './helpers/compute-contract.mjs';
import { createComputeServer } from '../server/route-compute/server.mjs';
import { parseComputeResponse, parseComputeRequest, CURRENT_COMPUTE_CONTRACT } from '../src/modules/route-compute/contract.ts';
import { FIGMA_SHAPE_VERSION } from '../src/modules/route-engine/figma-contours.ts';
const ajv = new Ajv({ strict: false, allErrors: true });
const validate = name => ajv.compile({ ...spec.components.schemas[name], components: spec.components });

test('API-CONTRACT-03: v2 distance/radius and v1 compatibility match OpenAPI', () => {
  const check=validate('Request');
  for(let km=1;km<=20;km++) {
    const value={...request,contract:CURRENT_COMPUTE_CONTRACT,options:{...request.options,targetKm:km,radiusKm:km<=10?2:km/4,shapeVersion:FIGMA_SHAPE_VERSION,maxRouteKm:20}};
    assert.ok(check(value),JSON.stringify(check.errors));assert.doesNotThrow(()=>parseComputeRequest(value));
    for(const patch of [{radiusKm:6},{maxRouteKm:21},{targetKm:21}]) {
      const invalid={...value,options:{...value.options,...patch}};
      assert.equal(check(invalid),false);assert.throws(()=>parseComputeRequest(invalid));
    }
  }
  assert.ok(check(request));assert.doesNotThrow(()=>parseComputeRequest(request));
});

test('API-CONTRACT-01: real HTTP health, success and error conform to published OpenAPI', async t => {
  const server = createComputeServer({ run: async input => response(input), close: async () => {} }, { usage: usageFixture() });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, init, status, schema] of [
    ['/health', {}, 200, 'Health'],
    ['/v1/routes', { method: 'POST', headers: { 'content-type': 'application/json', ...usageHeaders() }, body: JSON.stringify(request) }, 200, 'Response'],
    ['/v1/routes', { method: 'POST', headers: { 'content-type': 'application/json', ...usageHeaders() }, body: '{}' }, 400, 'Error'],
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
