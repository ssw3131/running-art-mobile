import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { candidateOverlay } from '../src/modules/route-engine/geojson.ts';
import { toLatLng } from '../src/modules/route-engine/engine.ts';
import { compareReference } from '../src/modules/route-engine/verification.ts';
import { calculateRoute, CalculationCancelled } from '../src/modules/route-engine/runner.ts';
import { calculateMobileRoute } from '../src/features/route-lab/scheduler.ts';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const grid = read('../assets/route-lab/grid.json');
const baseline = read('./fixtures/route-engine/grid-heart-v02.json').result;

test('map uses longitude/latitude, closes the actual route, and bounds both route and target', () => {
  const candidate = baseline.candidates[0];
  const overlay = candidateOverlay(candidate, grid.origin);
  const [lat, lng] = toLatLng(candidate.route[0], grid.origin);
  assert.deepEqual(overlay.start, [lng, lat]);
  assert.deepEqual(overlay.route.geometry.coordinates[0], overlay.route.geometry.coordinates.at(-1));
  for (const [longitude, latitude] of [...overlay.route.geometry.coordinates, ...overlay.target.geometry.coordinates]) {
    assert.ok(longitude >= overlay.bounds[0] && longitude <= overlay.bounds[2]);
    assert.ok(latitude >= overlay.bounds[1] && latitude <= overlay.bounds[3]);
  }
});

test('device comparison permits declared roundoff but detects score, ranking and geometry drift', () => {
  assert.equal(compareReference(baseline, baseline), null);
  const small = structuredClone(baseline);
  small.candidates[0].score.raw += 1e-7;
  assert.equal(compareReference(small, baseline), null);
  small.candidates[0].score.raw += .001;
  assert.equal(compareReference(small, baseline), 'result.candidates.0.score.raw');
  const swapped = structuredClone(baseline);
  [swapped.candidates[0], swapped.candidates[1]] = [swapped.candidates[1], swapped.candidates[0]];
  assert.ok(compareReference(swapped, baseline));
  const route = structuredClone(baseline);
  route.candidates[0].route[3].x += 1;
  assert.ok(compareReference(route, baseline));
});

test('reference fixtures bundled for Hermes are the same original results tested on Node', () => {
  const app = read('../assets/route-lab/baselines.json');
  for (const baseline of app) {
    assert.deepEqual(baseline, read(`./fixtures/route-engine/${baseline.id}.json`));
  }
});

test('cancellation can interrupt work inside the routing phase between progress callbacks', async () => {
  const controller = new AbortController();
  let now = 0, routing = false, routingYields = 0;
  await assert.rejects(calculateRoute(grid, {
    signal: controller.signal,
    sliceMs: 1,
    scheduler: { now: () => now++, yieldToHost: async () => {
      if (routing && ++routingYields === 50) controller.abort();
    } },
    onProgress: (p) => { if (p.phase === 'routing') routing = true; },
  }), CalculationCancelled);
  assert.equal(routingYields, 50);
});

test('app host scheduler preserves results while allowing other host work', async () => {
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10);
  try {
    const actual = await calculateMobileRoute(grid);
    assert.deepEqual(JSON.parse(JSON.stringify(actual.result)), baseline);
    assert.ok(ticks > 10);
  } finally { clearInterval(timer); }
});
