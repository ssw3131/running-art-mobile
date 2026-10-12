// Source of the published contract. Does not change the production HTTP handler.
import { readFileSync, writeFileSync } from 'node:fs';
const number = { type: 'number' }, nonnegative = { type: 'number', minimum: 0 };
const object = properties => ({ type: 'object', required: Object.keys(properties), properties });
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const array = (items, extra = {}) => ({ type: 'array', items, ...extra });
const numbers = names => object(Object.fromEntries(names.split(' ').map(name => [name, number])));
const schemas = {
  Point: numbers('x y'),
  Path: array(ref('Point'), { maxItems: 20000 }),
  Request: object({ contract: { const: 'runpen-routes-v1' },
    origin: object({ lat: { type: 'number', minimum: 33, exclusiveMaximum: 39 }, lng: { type: 'number', minimum: 124, exclusiveMaximum: 132 } }),
    options: {}, refresh: { type: 'boolean' } }),
  Error: object({ error: { type: 'string', minLength: 1 } }),
  Health: object({ contract: { const: 'runpen-routes-v1' }, ok: { const: true } }),
  Candidate: object({ ...numbers('rotation scale error loopKm accessKm scaleRatio templatePerimeter').properties,
    offset: ref('Point'), target: ref('Path'), route: ref('Path'), loop: ref('Path'), access: array(ref('Path')),
    score: numbers('raw total contour flow angles distanceFit reusePenalty lengthKm'),
    roadInfo: object({ crowd: { type: ['number', 'null'] }, stepsKm: number }),
    roadSegments: array(object({ way: { type: 'integer', minimum: 1 }, from: { type: 'integer', minimum: 1 }, to: { type: 'integer', minimum: 1 },
      start: { type: 'number', minimum: 0, maximum: 1 }, end: { type: 'number', minimum: 0, maximum: 1 }, bidirectional: { const: true } })) }),
  Response: object({ contract: { const: 'runpen-routes-v1' }, request: ref('Request'),
    result: object({ version: { const: '0.2' }, mode: { const: 'free-loop' }, start: ref('Point'), snapMeters: number,
      template: numbers('width height perimeter'), stats: numbers('placements routed extraRouted valid roads'),
      baseline: object({ candidates: array(numbers('score raw lengthKm')), valid: number, routed: number }),
      candidates: array(ref('Candidate'), { maxItems: 5 }) }),
    metrics: object({ elapsedMs: nonnegative, computeMs: nonnegative, maxSliceMs: nonnegative, yields: nonnegative, nodes: nonnegative, edges: nonnegative, routing: { type: 'object' } }),
    roads: object({ release: { type: 'string' }, manifestHash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, cached: { type: 'boolean' } }),
    timing: object({ roadMs: nonnegative, calculationMs: nonnegative, totalMs: nonnegative }) }),
};
schemas.Request.properties.options = {
  ...object({ version: { const: '0.2' }, mode: { const: 'free-loop' },
    shape: { enum: ['heart','star','cat','rabbit','house','diamond','bolt','fish','arrow','custom'] },
    targetKm: { enum: [3,5,7] }, radiusKm: { const: 2 } }),
  allOf: [{ if: { properties: { shape: { const: 'custom' } } }, then: {
    required: ['customTemplate'], properties: { customTemplate: array(object({ x: { type: 'number', minimum: -10, maximum: 10 }, y: { type: 'number', minimum: -10, maximum: 10 } }), { minItems: 4, maxItems: 49 }) },
  }, else: { not: { required: ['customTemplate'] } } }],
  description: 'Custom contours must close within 0.00001 and have perimeter >= 0.1. Semantic violations return 400. Unknown fields are ignored.',
};
const response = name => ({ description: name, content: { 'application/json': { schema: ref(name) } } });
export const spec = { openapi: '3.1.0', info: { title: 'RunPen route compute', version: '1.0.0' },
  servers: [{ url: 'http://127.0.0.1:8087', description: 'Isolated contract harness; never hosted production' }],
  paths: {
    '/healthz': { get: { operationId: 'health', responses: { 200: response('Health') } } },
    '/v1/routes': { post: { operationId: 'computeRoutes', description: 'JSON body <= 16384 bytes; response <= 8 MiB. No authentication required.',
      requestBody: { required: true, content: { 'application/json': { schema: ref('Request') } } },
      responses: Object.fromEntries([200,400,404,408,413,415,429,503,504].map(status => [status, response(status === 200 ? 'Response' : 'Error')])) } },
  }, components: { schemas } };
const filename = new URL('../../server/route-compute/openapi.json', import.meta.url);
const output = JSON.stringify(spec, null, 2) + '\n';
if (process.argv.includes('--write')) writeFileSync(filename, output);
if (process.argv.includes('--check') && readFileSync(filename, 'utf8') !== output) throw Error('OpenAPI drift: run node scripts/qa/openapi.mjs --write');
