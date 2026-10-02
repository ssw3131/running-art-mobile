import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareRoute, positionAt, createPlayer } from '../src/modules/course-simulation/player.ts';
import { courseFromCalculation } from '../src/features/route-lab/saved-course.ts';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);
function setup(points = [[0, 0], [0.001, 0], [0.004, 0]]) {
  let time = 0;
  const route = prepareRoute(points), player = createPlayer(route, () => time);
  return { route, player, advance: milliseconds => { time += milliseconds; } };
}
test('unequal segments move by distance, with exact start and end positions', () => {
  const route = prepareRoute([[0, 0], [0.001, 0], [0.004, 0]]);
  near(route.totalMeters, 444.779706578, 0.00001);
  near(positionAt(route, route.totalMeters / 2)[0], 0.002);
  assert.deepEqual(positionAt(route, -10), [0, 0]);
  assert.deepEqual(positionAt(route, Infinity), [0.004, 0]);
});
test('duplicate points and a closed loop preserve traversal order', () => {
  const route = prepareRoute([[0, 0], [0, 0], [0.001, 0], [0.001, 0], [0, 0], [0, 0]]);
  near(positionAt(route, route.totalMeters / 2)[0], 0.001);
  near(positionAt(route, route.totalMeters * 0.75)[0], 0.0005);
  assert.deepEqual(positionAt(route, route.totalMeters), [0, 0]);
});
test('date line takes the short segment', () => {
  const route = prepareRoute([[179.999, 0], [-179.999, 0]]);
  near(route.totalMeters, 222.389853, 0.001);
  near(Math.abs(positionAt(route, route.totalMeters / 2)[0]), 180);
});
test('route validation rejects empty, invalid, and zero length routes and copies input', () => {
  for (const points of [[], [[0, 0]], [[0, 0], [0, 0]], [[0, 0], [NaN, 0]], [[0, 0], [0, 90]]]) assert.throws(() => prepareRoute(points));
  const input = [[0, 0], [0.001, 0]], route = prepareRoute(input);
  input[1][0] = 30;
  assert.deepEqual(route.points[1], [0.001, 0]);
});
test('elapsed time drives distance even when rendering skips frames', () => {
  const { player, advance } = setup();
  player.play(); advance(10000);
  near(player.sample().meters, 10000 / 360);
  assert.equal(player.sample().playing, true);
});
test('constructing a player and reading initial UI state do not read the clock', () => {
  const route = prepareRoute([[0, 0], [0.001, 0]]);
  const player = createPlayer(route, () => { throw new Error('render must not read the clock'); });
  assert.equal(player.snapshot().meters, 0);
  assert.equal(player.snapshot().playing, false);
});
test('20,000 points retain the full path and locate late segments without truncation', () => {
  const points = Array.from({ length: 20000 }, (_, index) => [127 + index * 0.000001, 37]);
  const route = prepareRoute(points), index = 19000;
  assert.equal(route.points.length, 20000);
  const actual = positionAt(route, route.cumulative[index]);
  near(actual[0], points[index][0]); near(actual[1], points[index][1]);
  assert.deepEqual(positionAt(route, route.totalMeters), points.at(-1));
});
test('pause and resume exclude background time without a position jump', () => {
  const { player, advance } = setup();
  player.play(); advance(3600); const paused = player.pause();
  advance(600000); assert.deepEqual(player.sample(), paused);
  player.play(); advance(3600); near(player.sample().meters, 20);
});
test('speed changes apply after the switch and work while paused', () => {
  const { player, advance } = setup();
  player.play(); advance(3600); player.setSpeed(5);
  advance(3600); near(player.sample().meters, 60);
  player.pause(); player.setSpeed(10); advance(3600); near(player.sample().meters, 60);
  player.play(); advance(3600); near(player.sample().meters, 160);
  assert.throws(() => player.setSpeed(2));
});
test('arrival clamps at end, stops playback, and restart resets while keeping selected speed', () => {
  const { player, route, advance } = setup();
  player.setSpeed(30); player.play(); advance(100000);
  const end = player.sample();
  assert.equal(end.meters, route.totalMeters); assert.equal(end.progress, 1);
  assert.equal(end.playing, false); assert.equal(end.finished, true);
  assert.deepEqual(end.position, route.points.at(-1));
  assert.deepEqual(player.play(), end);
  const reset = player.restart();
  assert.equal(reset.meters, 0); assert.equal(reset.playing, false); assert.equal(reset.speed, 30);
  assert.equal(reset.finished, false); assert.deepEqual(reset.position, route.points[0]);
});
test('all 25 saved baseline candidates keep their coordinate order, endpoints and data', () => {
  let count = 0;
  for (const file of fs.readdirSync('tests/fixtures/route-engine').filter(v => v.endsWith('-v02.json'))) {
    const fixture = JSON.parse(fs.readFileSync(`tests/fixtures/route-engine/${file}`, 'utf8'));
    const input = JSON.parse(fs.readFileSync(`assets/route-lab/${fixture.fixture === 'grid' ? 'grid' : 'seoul'}.json`, 'utf8'));
    for (let index = 0; index < fixture.result.candidates.length; index++) {
      const snapshot = courseFromCalculation({ origin: input.origin, options: fixture.options, result: fixture.result, liveRoads: fixture.fixture !== 'grid' }, index);
      const before = structuredClone(snapshot), route = prepareRoute(snapshot.route);
      assert.deepEqual(route.points, snapshot.route);
      assert.deepEqual(positionAt(route, 0), snapshot.route[0]);
      assert.deepEqual(positionAt(route, route.totalMeters), snapshot.route.at(-1));
      for (let i = 1; i < route.cumulative.length - 1; i++) {
        if (route.cumulative[i] > 0) {
          const point = positionAt(route, route.cumulative[i]);
          near(point[0], snapshot.route[i][0]); near(point[1], snapshot.route[i][1]);
        }
      }
      assert.deepEqual(snapshot, before);
      count++;
    }
  }
  assert.equal(count, 25);
});
