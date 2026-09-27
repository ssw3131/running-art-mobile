import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as engine from '../src/modules/route-engine/engine.ts';
import { calculateRoute, CalculationCancelled, createRouteJobController, validateInput } from '../src/modules/route-engine/runner.ts';

const require = createRequire(import.meta.url);
const original = require('./reference/v02/src/route-engine.js');
const read = (relative) => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url)));
const grid = read('../assets/route-lab/grid.json');
const compact = (value) => JSON.parse(JSON.stringify(value));

test('preserved original sources match the v0.2 normalized SHA-256 manifest', () => {
  const manifest = fs.readFileSync(new URL('./reference/v02/SHA256SUMS.txt', import.meta.url), 'utf8');
  for (const line of manifest.trim().split(/\r?\n/)) {
    const [expected, file] = line.trim().split(/\s+/);
    const text = fs.readFileSync(new URL(`./reference/v02/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(text).digest('hex'), expected, file);
  }
});

for (const name of ['grid-heart-v02', 'grid-heart-v01', 'grid-diamond-v02', 'seoul-heart-v02', 'seoul-heart-5km-v02', 'seoul-diamond-v02']) {
  test(`all paths, raw scores, ranking and stats equal the original: ${name}`, () => {
    const expected = read(`./fixtures/route-engine/${name}.json`);
    const fixture = read(`../assets/route-lab/${expected.fixture}.json`);
    const graph = engine.buildGraph(fixture.elements, fixture.origin, expected.options.radiusKm * 1000);
    const actual = engine.search(graph, expected.options);
    assert.deepEqual(compact(actual), expected.result);
    assert.ok(actual.candidates.every((c) => c.scaleRatio >= .85 - 1e-8 && c.scaleRatio <= 1.15 + 1e-8));
    const usages = [];
    for (const c of actual.candidates) {
      assert.deepEqual(c.route[0], c.route.at(-1));
      const ids = c.route.map((p) => engine.nearestNode(graph, p, 0.001)?.id);
      assert.ok(ids.every((id) => id !== undefined));
      for (let i = 1; i < ids.length; i++) assert.ok(graph.nodes[ids[i - 1]].links.some((link) => link.to === ids[i]));
      const usage = engine.edgeUsage(graph, ids);
      assert.ok(usage.repeated / usage.total <= .30);
      assert.ok(c.score.lengthKm >= expected.options.targetKm * .75 && c.score.lengthKm <= expected.options.targetKm * 1.25);
      for (const previous of usages) {
        let common = 0;
        for (const [key, length] of usage.edges) if (previous.edges.has(key)) common += Math.min(length, previous.edges.get(key));
        const sum = (map) => [...map.values()].reduce((a, b) => a + b, 0);
        assert.ok(common / Math.min(sum(usage.edges), sum(previous.edges)) < .80);
      }
      usages.push(usage);
    }
    assert.ok(actual.candidates[0].score.raw >= actual.baseline.candidates[0].raw);
  });
}

test('cooperative scheduler gives control to the host and preserves the complete result', async () => {
  let ticks = 0;
  const timer = setInterval(() => ticks++, 5);
  try {
    const actual = await calculateRoute(grid);
    assert.ok(ticks > 10);
    assert.ok(actual.metrics.yields > 10);
    assert.deepEqual(compact(actual.result), read('./fixtures/route-engine/grid-heart-v02.json').result);
  } finally { clearInterval(timer); }
});

for (const phase of ['graph', 'placement', 'routing', 'refine']) {
  test(`abort interrupts ${phase} without publishing a result`, async () => {
    const controller = new AbortController();
    const visited = [];
    await assert.rejects(calculateRoute(grid, { signal: controller.signal, onProgress: (p) => {
      visited.push(p.phase);
      if (p.phase === phase) controller.abort();
    } }), CalculationCancelled);
    assert.equal(visited.at(-1), phase);
  });
}

test('cancelled and superseded jobs cannot publish old progress, errors or results', async () => {
  const pending = [];
  const jobs = createRouteJobController((input, settings) => new Promise((resolve, reject) => pending.push({ settings, resolve, reject })));
  const events = [];
  const callbacks = { progress: (p) => events.push(p.text), success: (v) => events.push(v), error: (e) => events.push(e.message) };
  const first = jobs.start(grid, callbacks);
  const second = jobs.start(grid, callbacks);
  assert.equal(pending[0].settings.signal.aborted, true);
  pending[0].settings.onProgress({ phase: 'routing', text: 'stale' });
  pending[0].resolve('old');
  pending[1].resolve('latest');
  await Promise.all([first, second]);
  assert.deepEqual(events, ['latest']);
  const third = jobs.start(grid, callbacks);
  jobs.cancel();
  pending[2].reject(new Error('cancelled late error'));
  await third;
  assert.deepEqual(events, ['latest']);
});

test('all v0.2 templates are preserved, including custom templates and invalid-input errors', () => {
  for (const shape of original.SHAPES) assert.deepEqual(engine.templateFor(shape.id), original.templateFor(shape.id));
  for (const targetKm of [0, -1, NaN, Infinity]) assert.throws(() => validateInput({ ...grid, options: { ...grid.options, targetKm } }));
  assert.throws(() => validateInput({ ...grid, options: { ...grid.options, version: '0.1' } }));
  assert.throws(() => validateInput({ ...grid, options: { ...grid.options, customTemplate: [] } }));
  assert.throws(() => validateInput({ ...grid, elements: [{ type: 'way', id: 1, nodes: [1], geometry: [] }] }));
});

test('empty graphs error and connected but unusable outlines return no candidates', async () => {
  await assert.rejects(calculateRoute({ ...grid, elements: [] }), /100m/);
  const tiny = { ...grid, elements: [{ type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'footway' }, geometry: [{ lat: grid.origin.lat, lon: grid.origin.lng }, { lat: grid.origin.lat, lon: grid.origin.lng + .0001 }] }] };
  const value = await calculateRoute(tiny);
  assert.equal(value.result.candidates.length, 0);
});
