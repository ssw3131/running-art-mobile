// Source of the published contract. Does not change the production HTTP handler.
import { readFileSync, writeFileSync } from 'node:fs';
import { SHAPES } from '../../src/modules/route-engine/engine.ts';
import { GENERATION_DISTANCES, SUPPORTED_GENERATION_DISTANCES, generationRadiusKm } from '../../src/modules/route-engine/service-shapes.ts';
import { FIGMA_SHAPE_VERSION } from '../../src/modules/route-engine/figma-contours.ts';
const number = { type: 'number' }, nonnegative = { type: 'number', minimum: 0 };
const object = properties => ({ type: 'object', required: Object.keys(properties), properties });
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const array = (items, extra = {}) => ({ type: 'array', items, ...extra });
const numbers = names => object(Object.fromEntries(names.split(' ').map(name => [name, number])));
const schemas = {
  Point: numbers('x y'),
  Path: array(ref('Point'), { maxItems: 20000 }),
  Request: object({ contract: { enum: ['runpen-routes-v1','runpen-routes-v2'] },
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
  Response: object({ contract: { enum: ['runpen-routes-v1','runpen-routes-v2'] }, request: ref('Request'),
    result: object({ version: { const: '0.2' }, mode: { const: 'free-loop' }, start: ref('Point'), snapMeters: number,
      template: numbers('width height perimeter'), stats: numbers('placements routed extraRouted valid roads'),
      baseline: object({ candidates: array(numbers('score raw lengthKm')), valid: number, routed: number }),
      candidates: array(ref('Candidate'), { maxItems: 5 }) }),
    metrics: object({ elapsedMs: nonnegative, computeMs: nonnegative, maxSliceMs: nonnegative, yields: nonnegative, nodes: nonnegative, edges: nonnegative, routing: { type: 'object' } }),
    roads: object({ release: { type: 'string' }, manifestHash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, cached: { type: 'boolean' } }),
    timing: object({ roadMs: nonnegative, calculationMs: nonnegative, totalMs: nonnegative }) }),
};
const options = {
  ...object({ version: { const: '0.2' }, mode: { const: 'free-loop' },
    shape: { enum: [...SHAPES.map(shape => shape.id), 'custom'] },
    targetKm: { enum: SUPPORTED_GENERATION_DISTANCES }, radiusKm: { type: 'number', minimum: 2, maximum: 5 } }),
  oneOf: SUPPORTED_GENERATION_DISTANCES.map(km => ({ properties: { targetKm: { const: km }, radiusKm: { const: generationRadiusKm(km) } } })),
  allOf: [{ if: { properties: { shape: { const: 'custom' } } }, then: {
    required: ['customTemplate'], properties: { customTemplate: array(object({ x: { type: 'number', minimum: -10, maximum: 10 }, y: { type: 'number', minimum: -10, maximum: 10 } }), { minItems: 4, maxItems: 49 }) },
  }, else: { not: { required: ['customTemplate'] } } }],
  description: 'Custom contours must close within 0.00001 and have perimeter >= 0.1. Semantic violations return 400. Unknown fields are ignored.',
};
schemas.Request.properties.options = options;
schemas.Request.allOf = [{ if: { properties: { contract: { const: 'runpen-routes-v2' } } }, then: {
  properties: { options: { required: ['shapeVersion','maxRouteKm'], properties: { shapeVersion: { const: FIGMA_SHAPE_VERSION }, maxRouteKm: { const: 20 } } } },
}, else: { properties: { options: { properties: { targetKm: { enum: GENERATION_DISTANCES }, radiusKm: { const: 2 }, shape: { not: { const: 'whale' } } },
  not: { anyOf: [{ required: ['shapeVersion'] }, { required: ['maxRouteKm'] }] } } } } }];
schemas.Response.allOf = [{ if: { properties: { contract: { const: 'runpen-routes-v2' } } }, then: {
  properties: { request: { properties: { contract: { const: 'runpen-routes-v2' } } }, result: { properties: { candidates: { items: { properties: { score: { properties: { lengthKm: { type:'number', exclusiveMinimum:0, maximum:20 } } } } } } } } },
}, else: { properties: { request: { properties: { contract: { const: 'runpen-routes-v1' } } } } } }];
const response = name => ({ description: name, content: { 'application/json': { schema: ref(name) } } });
export const spec = { openapi: '3.1.0', info: { title: 'RunPen route compute', version: '2.0.0' },
  servers: [{ url: 'http://127.0.0.1:8087', description: 'Isolated contract harness; never hosted production' }],
  paths: {
    '/health': { get: { operationId: 'health', responses: { 200: response('Health') } } },
    '/v1/routes': { post: { operationId: 'computeRoutes', description: 'JSON body <= 16384 bytes; response <= 8 MiB. Completed membership and bearer authentication required. x-operation-id identifies one reserved generation; confirm receipt through the usage API.',
      security: [{ bearerAuth: [] }], parameters: [{in:'header',name:'x-operation-id',required:true,schema:{type:'string',format:'uuid'}}], requestBody: { required: true, content: { 'application/json': { schema: ref('Request') } } },
      responses: Object.fromEntries([200,400,401,403,404,408,409,413,415,429,503,504].map(status => [status, response(status === 200 ? 'Response' : 'Error')])) } },
  }, components: { schemas, securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } };
const filename = new URL('../../server/route-compute/openapi.json', import.meta.url);
const output = JSON.stringify(spec, null, 2) + '\n';
if (process.argv.includes('--write')) writeFileSync(filename, output);
if (process.argv.includes('--check') && readFileSync(filename, 'utf8') !== output) throw Error('OpenAPI drift: run node scripts/qa/openapi.mjs --write');
